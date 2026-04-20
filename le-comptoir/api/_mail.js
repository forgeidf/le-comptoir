// api/_mail.js
// Envoi d'emails via Gmail (gratuit, pas besoin de domaine)
// Utilise Nodemailer avec un "mot de passe d'application" Google

import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('GMAIL_USER ou GMAIL_APP_PASSWORD non défini');
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
  return transporter;
}

/**
 * Envoie un email
 * @param {Object} opts - { to, subject, html, replyTo }
 * @returns {Promise}
 */
export async function sendMail({ to, subject, html, replyTo }) {
  const t = getTransporter();
  const from = `Le Comptoir <${process.env.GMAIL_USER}>`;
  const toList = Array.isArray(to) ? to.join(', ') : to;

  const mailOptions = {
    from,
    to: toList,
    subject,
    html
  };
  if (replyTo) mailOptions.replyTo = replyTo;

  return t.sendMail(mailOptions);
}
