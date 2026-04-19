// api/admin.js
// API admin sécurisée par token secret
// GET  /api/admin?resource=orders|leads|config|order&id=...
// POST /api/admin { action, ... }

import { kv } from './_kv.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function isAuthorized(req) {
  const token = req.headers['x-admin-token'];
  return token && token === process.env.ADMIN_SECRET;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  // ── GET ──
  if (req.method === 'GET') {
    const { resource, id, page = 1 } = req.query;
    const PAGE_SIZE = 30;

    try {
      // Liste des commandes
      if (resource === 'orders') {
        const allIds = await kv.lrange('orders:list', 0, -1);
        // Pagination
        const start = (Number(page) - 1) * PAGE_SIZE;
        const pageIds = allIds.slice(start, start + PAGE_SIZE);
        const orders = await Promise.all(pageIds.map(id => kv.get(`order:${id}`)));
        const validOrders = orders.filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));
        return res.status(200).json({ orders: validOrders, total: allIds.length });
      }

      // Détail d'une commande
      if (resource === 'order' && id) {
        const order = await kv.get(`order:${id}`);
        if (!order) return res.status(404).json({ error: 'Commande introuvable' });
        return res.status(200).json({ order });
      }

      // Demandes de devis
      if (resource === 'leads') {
        const allLeads = await kv.lrange('leads:list', 0, 199);
        const leads = await Promise.all(allLeads.map(id => kv.get(`lead:${id}`)));
        const valid = leads.filter(Boolean).sort((a, b) => new Date(b.date) - new Date(a.date));
        return res.status(200).json({ leads: valid });
      }

      // Config site
      if (resource === 'config') {
        const config = await kv.get('site:config');
        return res.status(200).json({ config: config || null });
      }

      // Stats dashboard
      if (resource === 'stats') {
        const allIds = await kv.lrange('orders:list', 0, -1);
        const orders = await Promise.all(allIds.slice(0, 100).map(id => kv.get(`order:${id}`)));
        const valid = orders.filter(Boolean);
        const total = valid.reduce((s, o) => s + (o.total || 0), 0);
        const byStatus = valid.reduce((acc, o) => {
          acc[o.status] = (acc[o.status] || 0) + 1;
          return acc;
        }, {});
        const leads = await kv.llen('leads:list');
        return res.status(200).json({
          totalOrders: allIds.length,
          totalRevenue: total,
          byStatus,
          totalLeads: leads || 0,
        });
      }

      return res.status(400).json({ error: 'Resource non reconnue' });
    } catch (err) {
      console.error('Admin GET error:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  // ── POST ──
  if (req.method === 'POST') {
    const { action, ...data } = req.body;

    try {
      // Mettre à jour le statut d'une commande
      if (action === 'update_order_status') {
        const { orderId, status, note } = data;
        if (!orderId || !status) return res.status(400).json({ error: 'Données manquantes' });

        const validStatuses = ['confirmée', 'en_preparation', 'expediee', 'livree', 'annulee'];
        if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

        const order = await kv.get(`order:${orderId}`);
        if (!order) return res.status(404).json({ error: 'Commande introuvable' });

        const updated = {
          ...order,
          status,
          history: [
            ...order.history,
            {
              status,
              date: new Date().toISOString(),
              note: note || `Statut mis à jour par l'admin`
            }
          ]
        };

        if (data.trackingNumber) updated.trackingNumber = data.trackingNumber;

        await kv.set(`order:${orderId}`, updated, { ex: 60 * 60 * 24 * 365 });

        // Envoyer email de mise à jour au client
        const siteUrl = process.env.SITE_URL || 'https://lecomptoir.vercel.app';
        const trackingUrl = `${siteUrl}/?suivi=${order.token}`;

        if (['en_preparation', 'expediee', 'livree'].includes(status)) {
          await resend.emails.send({
            from: 'Le Comptoir <commandes@lecomptoir-atelier.fr>',
            to: [order.client.email],
            subject: statusEmailSubject(status, orderId),
            html: statusEmailHTML({ order: updated, status, trackingUrl, trackingNumber: data.trackingNumber }),
          });
        }

        return res.status(200).json({ success: true, order: updated });
      }

      // Supprimer une commande
      if (action === 'delete_order') {
        const { orderId } = data;
        const order = await kv.get(`order:${orderId}`);
        if (order) {
          await kv.del(`order:${orderId}`);
          await kv.del(`order_token:${order.token}`);
          await kv.lrem('orders:list', 0, orderId);
        }
        return res.status(200).json({ success: true });
      }

      // Supprimer un lead
      if (action === 'delete_lead') {
        const { leadId } = data;
        await kv.del(`lead:${leadId}`);
        await kv.lrem('leads:list', 0, leadId);
        return res.status(200).json({ success: true });
      }

      // Sauvegarder config site
      if (action === 'save_config') {
        const { config } = data;
        if (!config) return res.status(400).json({ error: 'Config manquante' });
        await kv.set('site:config', config);
        return res.status(200).json({ success: true });
      }

      // Authentification admin (pour obtenir le token)
      if (action === 'login') {
        const { password } = data;
        if (password !== process.env.ADMIN_PASSWORD) {
          return res.status(401).json({ error: 'Mot de passe incorrect' });
        }
        return res.status(200).json({ token: process.env.ADMIN_SECRET });
      }

      return res.status(400).json({ error: 'Action non reconnue' });
    } catch (err) {
      console.error('Admin POST error:', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── Emails de statut ──
function statusEmailSubject(status, orderId) {
  const labels = {
    en_preparation: `🔧 Votre commande ${orderId} est en préparation`,
    expediee: `📦 Votre commande ${orderId} est expédiée !`,
    livree: `✅ Votre commande ${orderId} a été livrée`,
  };
  return labels[status] || `Mise à jour commande ${orderId}`;
}

function statusEmailHTML({ order, status, trackingUrl, trackingNumber }) {
  const icons = { en_preparation: '🔧', expediee: '📦', livree: '✅' };
  const messages = {
    en_preparation: 'Nous préparons votre commande avec soin. Elle sera expédiée très prochainement.',
    expediee: `Votre commande est en route !${trackingNumber ? ` Numéro de suivi Colissimo : <strong style="color:#ff6435;">${trackingNumber}</strong>` : ''}`,
    livree: 'Votre commande a été livrée. Nous espérons que vos produits vous donnent entière satisfaction !',
  };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#11110f;font-family:Inter,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="margin-bottom:28px;font-size:22px;font-weight:800;color:#f5f4f0;">Le <span style="color:#ff6435;">Comptoir</span></div>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:14px;padding:36px;">
    <div style="font-size:32px;margin-bottom:12px;">${icons[status] || '📋'}</div>
    <h2 style="color:#f5f4f0;font-size:20px;margin:0 0 12px;">${statusEmailSubject(status, order.id)}</h2>
    <p style="color:#a8a7a0;font-size:14px;line-height:1.65;margin:0 0 24px;">${messages[status] || ''}</p>
    <a href="${trackingUrl}" style="display:inline-block;padding:13px 24px;background:#ff6435;color:#11110f;font-weight:700;font-size:13px;text-decoration:none;border-radius:8px;">Voir ma commande →</a>
  </div>
  <div style="margin-top:24px;text-align:center;color:#6f6e68;font-size:12px;">
    Le Comptoir — 28 rue de la Grange-aux-Belles, 75010 Paris
  </div>
</div>
</body></html>`;
}
