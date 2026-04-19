// api/lead.js
// Reçoit les demandes de devis du formulaire contact

import { kv } from './_kv.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prenom, nom, email, tel, type, modele, message } = req.body;

    if (!prenom || !email || !message) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    const leadId = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const lead = {
      id: leadId,
      date: new Date().toISOString(),
      prenom, nom, email, tel, type, modele, message,
      status: 'nouveau' // nouveau | traite | archive
    };

    // Sauvegarde KV
    await kv.set(`lead:${leadId}`, lead, { ex: 60 * 60 * 24 * 365 });
    await kv.lpush('leads:list', leadId);

    // Email admin
    const shopEmail = process.env.SHOP_EMAIL || 'salut@lecomptoir-atelier.fr';
    await resend.emails.send({
      from: 'Le Comptoir <commandes@lecomptoir-atelier.fr>',
      to: [shopEmail],
      replyTo: email,
      subject: `💬 Nouveau devis — ${prenom} ${nom || ''} (${type || 'Général'})`,
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#11110f;font-family:Inter,sans-serif;">
<div style="max-width:540px;margin:0 auto;padding:32px 20px;">
  <h2 style="color:#ff6435;margin:0 0 20px;">💬 Nouvelle demande de devis</h2>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:12px;padding:24px;margin-bottom:14px;">
    <div style="color:#6f6e68;font-size:11px;margin-bottom:6px;letter-spacing:1px;">CLIENT</div>
    <div style="color:#f5f4f0;font-size:15px;font-weight:600;">${prenom} ${nom || ''}</div>
    <div style="color:#a8a7a0;font-size:13px;">${email}</div>
    ${tel ? `<div style="color:#a8a7a0;font-size:13px;">${tel}</div>` : ''}
  </div>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:12px;padding:24px;margin-bottom:14px;">
    <div style="color:#6f6e68;font-size:11px;margin-bottom:6px;letter-spacing:1px;">PRESTATION</div>
    <div style="color:#ff6435;font-size:14px;font-weight:600;">${type || '—'}</div>
    <div style="color:#a8a7a0;font-size:13px;">${modele || '—'}</div>
  </div>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:12px;padding:24px;">
    <div style="color:#6f6e68;font-size:11px;margin-bottom:6px;letter-spacing:1px;">MESSAGE</div>
    <div style="color:#f5f4f0;font-size:14px;line-height:1.65;">${message.replace(/\n/g, '<br>')}</div>
  </div>
  <p style="color:#6f6e68;font-size:12px;margin-top:20px;">Répondez directement à cet email pour contacter ${prenom}.</p>
</div>
</body></html>`,
    });

    // Email de confirmation client
    await resend.emails.send({
      from: 'Le Comptoir <commandes@lecomptoir-atelier.fr>',
      to: [email],
      subject: `Demande reçue — Le Comptoir`,
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#11110f;font-family:Inter,sans-serif;">
<div style="max-width:540px;margin:0 auto;padding:40px 20px;">
  <div style="margin-bottom:24px;font-size:22px;font-weight:800;color:#f5f4f0;">Le <span style="color:#ff6435;">Comptoir</span></div>
  <div style="background:#18181a;border:1px solid rgba(168,167,160,0.08);border-radius:14px;padding:36px;">
    <div style="font-size:28px;margin-bottom:12px;">👍</div>
    <h2 style="color:#f5f4f0;font-size:20px;margin:0 0 12px;">Demande bien reçue !</h2>
    <p style="color:#a8a7a0;font-size:14px;line-height:1.65;margin:0;">Bonjour ${prenom}, on a bien reçu votre demande. On vous recontacte sous <strong style="color:#f5f4f0;">24h</strong> avec un devis précis et un créneau disponible.</p>
  </div>
  <div style="margin-top:24px;text-align:center;color:#6f6e68;font-size:12px;">Le Comptoir · 28 rue de la Grange-aux-Belles, 75010 Paris</div>
</div>
</body></html>`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Lead error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
