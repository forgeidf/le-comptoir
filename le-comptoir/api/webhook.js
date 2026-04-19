// api/webhook.js
// Reçoit les événements Stripe, sauvegarde la commande, envoie les emails

import Stripe from 'stripe';
import { kv } from './_kv.js';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// Vercel lit le raw body via config
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(Buffer.from(data)));
    req.on('error', reject);
  });
}

function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LC-${ts}-${rand}`;
}

function generateTrackingToken() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 24);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const meta = session.metadata;
      const items = JSON.parse(meta.items || '[]');
      const shipping = session.shipping_details?.address || {};
      const orderId = generateOrderId();
      const trackingToken = generateTrackingToken();

      const order = {
        id: orderId,
        token: trackingToken,
        stripeSessionId: session.id,
        status: 'confirmée',
        // Statuts possibles : confirmée | en_preparation | expediee | livree | annulee
        date: new Date().toISOString(),
        client: {
          prenom: meta.prenom || '',
          nom: meta.nom || '',
          email: session.customer_email,
          phone: meta.phone || '',
        },
        adresse: {
          ligne1: shipping.line1 || '',
          ligne2: shipping.line2 || '',
          ville: shipping.city || '',
          cp: shipping.postal_code || '',
          pays: shipping.country || 'FR',
        },
        items,
        subtotal: items.reduce((s, i) => s + i.prix * i.qty, 0),
        livraison: parseFloat(meta.livraison || '0'),
        total: session.amount_total / 100,
        paiement: 'stripe',
        history: [
          { status: 'confirmée', date: new Date().toISOString(), note: 'Paiement reçu via Stripe' }
        ]
      };

      // Sauvegarde dans Vercel KV
      // index par id + par token pour le suivi client
      await kv.set(`order:${orderId}`, order, { ex: 60 * 60 * 24 * 365 }); // 1 an
      await kv.set(`order_token:${trackingToken}`, orderId, { ex: 60 * 60 * 24 * 365 });
      // Liste globale pour l'admin
      await kv.lpush('orders:list', orderId);

      const siteUrl = process.env.SITE_URL || 'https://lecomptoir.vercel.app';
      const trackingUrl = `${siteUrl}/?suivi=${trackingToken}`;

      // ─── Email client ───
      await resend.emails.send({
        from: 'Le Comptoir <commandes@lecomptoir-atelier.fr>',
        to: [session.customer_email],
        subject: `✅ Commande confirmée — ${orderId}`,
        html: emailClientHTML({ order, trackingUrl }),
      });

      // ─── Email admin ───
      const shopEmail = process.env.SHOP_EMAIL || 'salut@lecomptoir-atelier.fr';
      await resend.emails.send({
        from: 'Le Comptoir <commandes@lecomptoir-atelier.fr>',
        to: [shopEmail],
        subject: `🛒 Nouvelle commande ${orderId} — ${order.total.toFixed(2)}€`,
        html: emailAdminHTML({ order }),
      });

      console.log(`Order ${orderId} created for ${session.customer_email}`);
    } catch (err) {
      console.error('Order processing error:', err);
      // Ne pas renvoyer d'erreur à Stripe pour éviter les retries
    }
  }

  res.status(200).json({ received: true });
}

// ─── TEMPLATES EMAIL ───

function emailClientHTML({ order, trackingUrl }) {
  const itemsHtml = order.items.map(i =>
    `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#f5f4f0;font-size:14px;">${i.nom}</td>
      <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#a8a7a0;font-size:14px;text-align:center;">×${i.qty}</td>
      <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;color:#ff6435;font-size:14px;text-align:right;font-weight:700;">${(i.prix * i.qty).toFixed(2)} €</td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#11110f;font-family:Inter,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:40px 20px;">
  <div style="margin-bottom:32px;">
    <span style="font-size:22px;font-weight:800;color:#f5f4f0;letter-spacing:-0.8px;">Le <span style="color:#ff6435;">Comptoir</span></span>
  </div>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:14px;padding:36px;">
    <div style="font-size:28px;margin-bottom:8px;">✅</div>
    <h1 style="font-size:22px;font-weight:800;color:#f5f4f0;margin:0 0 8px;letter-spacing:-0.5px;">Commande confirmée !</h1>
    <p style="color:#a8a7a0;font-size:14px;margin:0 0 28px;line-height:1.6;">Bonjour ${order.client.prenom || 'cher client'}, votre paiement a bien été reçu. Nous préparons votre commande.</p>
    
    <div style="background:#11110f;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-family:monospace;font-size:11px;color:#6f6e68;letter-spacing:1px;margin-bottom:4px;">N° DE COMMANDE</div>
      <div style="font-size:18px;font-weight:800;color:#ff6435;letter-spacing:-0.5px;">${order.id}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${itemsHtml}
    </table>
    
    <div style="border-top:1px solid rgba(168,167,160,0.08);padding-top:16px;">
      ${order.livraison > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#a8a7a0;font-size:13px;">Livraison</span><span style="color:#a8a7a0;font-size:13px;">${order.livraison.toFixed(2)} €</span></div>` : `<div style="margin-bottom:8px;color:#4ed28a;font-size:13px;">🎁 Livraison offerte</div>`}
      <div style="display:flex;justify-content:space-between;"><span style="color:#f5f4f0;font-size:16px;font-weight:700;">Total payé</span><span style="color:#ff6435;font-size:20px;font-weight:800;">${order.total.toFixed(2)} €</span></div>
    </div>
  </div>

  <div style="margin-top:20px;background:#18181a;border:1px solid rgba(255,100,53,0.22);border-radius:14px;padding:28px;text-align:center;">
    <div style="font-size:15px;font-weight:700;color:#f5f4f0;margin-bottom:8px;">Suivre ma commande</div>
    <p style="color:#a8a7a0;font-size:13px;margin:0 0 20px;line-height:1.6;">Retrouvez le statut de votre commande en temps réel avec ce lien unique — aucun compte nécessaire.</p>
    <a href="${trackingUrl}" style="display:inline-block;padding:14px 28px;background:#ff6435;color:#11110f;font-weight:700;font-size:14px;text-decoration:none;border-radius:8px;">Suivre ma commande →</a>
    <p style="color:#6f6e68;font-size:11px;margin:16px 0 0;">Vous pouvez aussi annuler depuis cette page tant que la commande n'est pas expédiée.</p>
  </div>

  <div style="margin-top:32px;text-align:center;color:#6f6e68;font-size:12px;line-height:1.7;">
    <strong style="color:#a8a7a0;">Le Comptoir</strong> — 28 rue de la Grange-aux-Belles, 75010 Paris<br>
    Livraison Colissimo 2-3 jours ouvrés
  </div>
</div>
</body></html>`;
}

function emailAdminHTML({ order }) {
  const itemsHtml = order.items.map(i =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#f5f4f0;font-size:13px;">${i.nom}</td>
     <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#a8a7a0;font-size:13px;text-align:center;">×${i.qty}</td>
     <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#ff6435;font-size:13px;text-align:right;">${(i.prix * i.qty).toFixed(2)} €</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#11110f;font-family:Inter,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <h2 style="color:#ff6435;font-size:18px;margin:0 0 20px;">🛒 Nouvelle commande — ${order.id}</h2>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:12px;padding:28px;margin-bottom:16px;">
    <div style="color:#a8a7a0;font-size:12px;margin-bottom:16px;letter-spacing:1px;">CLIENT</div>
    <div style="color:#f5f4f0;font-size:15px;font-weight:600;">${order.client.prenom} ${order.client.nom}</div>
    <div style="color:#a8a7a0;font-size:13px;">${order.client.email}</div>
    ${order.client.phone ? `<div style="color:#a8a7a0;font-size:13px;">${order.client.phone}</div>` : ''}
    <div style="margin-top:12px;color:#a8a7a0;font-size:13px;">${order.adresse.ligne1}${order.adresse.ligne2 ? ', ' + order.adresse.ligne2 : ''}<br>${order.adresse.cp} ${order.adresse.ville}</div>
  </div>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:12px;padding:28px;">
    <div style="color:#a8a7a0;font-size:12px;margin-bottom:16px;letter-spacing:1px;">PRODUITS</div>
    <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
    <div style="margin-top:16px;text-align:right;color:#ff6435;font-size:20px;font-weight:800;">${order.total.toFixed(2)} €</div>
  </div>
</div>
</body></html>`;
}
