// api/checkout.js
// Crée une session Stripe Checkout et retourne l'URL de paiement

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items, customer } = req.body;
    // items = [{ id, nom, prix, qty, img }]
    // customer = { prenom, nom, email, phone }

    if (!items?.length) return res.status(400).json({ error: 'Panier vide' });
    if (!customer?.email) return res.status(400).json({ error: 'Email requis' });

    // Construire les line_items Stripe
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'eur',
        product_data: {
          name: item.nom,
          ...(item.img ? { images: [item.img] } : {})
        },
        unit_amount: Math.round(item.prix * 100), // centimes
      },
      quantity: item.qty,
    }));

    // Calcul livraison : offerte dès 50€
    const subtotal = items.reduce((s, i) => s + i.prix * i.qty, 0);
    const livraison = subtotal >= 50 ? 0 : 490; // 4,90 € en centimes

    if (livraison > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Livraison Colissimo (2-3 jours)' },
          unit_amount: livraison,
        },
        quantity: 1,
      });
    }

    const siteUrl = process.env.SITE_URL || 'https://lecomptoir.vercel.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      customer_email: customer.email,
      metadata: {
        prenom: customer.prenom || '',
        nom: customer.nom || '',
        phone: customer.phone || '',
        items: JSON.stringify(items.map(i => ({ id: i.id, nom: i.nom, prix: i.prix, qty: i.qty }))),
        livraison: String(livraison / 100),
      },
      shipping_address_collection: { allowed_countries: ['FR', 'BE', 'CH', 'LU'] },
      success_url: `${siteUrl}/?commande=ok&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?commande=annulee`,
      locale: 'fr',
      // Expiration 30 min
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
}
