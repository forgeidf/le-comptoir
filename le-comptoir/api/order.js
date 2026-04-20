// api/order.js
// GET  ?token=xxx        → retourne les détails de la commande (suivi client)
// POST { token, action: 'cancel' } → annule la commande si possible

import { kv } from './_kv.js';
import { sendMail } from './_mail.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET : suivi commande
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token manquant' });

    try {
      const orderId = await kv.get(`order_token:${token}`);
      if (!orderId) return res.status(404).json({ error: 'Commande introuvable' });

      const order = await kv.get(`order:${orderId}`);
      if (!order) return res.status(404).json({ error: 'Commande introuvable' });

      const safe = {
        id: order.id,
        status: order.status,
        date: order.date,
        items: order.items,
        subtotal: order.subtotal,
        livraison: order.livraison,
        total: order.total,
        adresse: {
          ville: order.adresse?.ville || '',
          cp: order.adresse?.cp || '',
          pays: order.adresse?.pays || '',
        },
        history: order.history,
        trackingNumber: order.trackingNumber || null,
        canCancel: ['confirmée', 'en_preparation'].includes(order.status),
      };

      return res.status(200).json({ order: safe });
    } catch (err) {
      console.error('Order GET error:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  // POST : actions sur la commande
  if (req.method === 'POST') {
    const { token, action } = req.body;
    if (!token || !action) return res.status(400).json({ error: 'Données manquantes' });

    try {
      const orderId = await kv.get(`order_token:${token}`);
      if (!orderId) return res.status(404).json({ error: 'Commande introuvable' });

      const order = await kv.get(`order:${orderId}`);
      if (!order) return res.status(404).json({ error: 'Commande introuvable' });

      if (action === 'cancel') {
        if (!['confirmée', 'en_preparation'].includes(order.status)) {
          return res.status(400).json({
            error: order.status === 'expediee'
              ? 'Impossible d\'annuler : commande déjà expédiée. Contactez-nous par email.'
              : 'Cette commande ne peut plus être annulée.'
          });
        }

        const updated = {
          ...order,
          status: 'annulee',
          history: [
            ...order.history,
            { status: 'annulee', date: new Date().toISOString(), note: 'Annulée par le client' }
          ]
        };

        await kv.set(`order:${orderId}`, updated, { ex: 60 * 60 * 24 * 365 });

        // Email client
        try {
          await sendMail({
            to: order.client.email,
            subject: `Commande ${orderId} annulée`,
            html: cancelEmailHTML({ order }),
          });
        } catch (e) { console.error('Mail cancel client fail:', e.message); }

        // Notif admin
        const shopEmail = process.env.SHOP_EMAIL || process.env.GMAIL_USER;
        if (shopEmail) {
          try {
            await sendMail({
              to: shopEmail,
              subject: `⚠ Annulation commande ${orderId}`,
              html: `<div style="font-family:sans-serif;padding:24px;background:#11110f;color:#f5f4f0;">
                <h2 style="color:#ff6435;">Commande annulée par le client</h2>
                <p><strong>${orderId}</strong> — ${order.client.prenom} ${order.client.nom} (${order.client.email})</p>
                <p>Total : <strong>${order.total.toFixed(2)} €</strong></p>
                <p style="color:#a8a7a0;font-size:13px;">Le remboursement Stripe doit être émis manuellement depuis votre dashboard Stripe.</p>
              </div>`,
            });
          } catch (e) { console.error('Mail cancel admin fail:', e.message); }
        }

        return res.status(200).json({ success: true, message: 'Commande annulée' });
      }

      return res.status(400).json({ error: 'Action non reconnue' });
    } catch (err) {
      console.error('Order POST error:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function cancelEmailHTML({ order }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#11110f;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="margin-bottom:28px;font-size:22px;font-weight:800;color:#f5f4f0;">Le <span style="color:#ff6435;">Comptoir</span></div>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:14px;padding:36px;">
    <div style="font-size:28px;margin-bottom:12px;">✕</div>
    <h2 style="color:#f5f4f0;font-size:20px;margin:0 0 12px;">Commande annulée</h2>
    <p style="color:#a8a7a0;font-size:14px;line-height:1.65;margin:0 0 20px;">Bonjour ${order.client.prenom || ''}, votre commande <strong style="color:#ff6435;">${order.id}</strong> a bien été annulée.</p>
    <p style="color:#a8a7a0;font-size:14px;line-height:1.65;margin:0 0 20px;">Le remboursement sera traité sous <strong style="color:#f5f4f0;">5 à 10 jours ouvrés</strong> sur votre moyen de paiement d'origine.</p>
  </div>
</div>
</body></html>`;
}
