# Le Comptoir — Guide de déploiement

## Vue d'ensemble

Ce dossier contient le site e-commerce complet de Le Comptoir, prêt à déployer sur **Vercel** (gratuit).

```
le-comptoir/
├── index.html          ← Site complet (frontend)
├── vercel.json         ← Config déploiement Vercel
├── api/
│   ├── checkout.js     ← Création session Stripe
│   ├── webhook.js      ← Confirmation paiement + emails
│   ├── order.js        ← Suivi & annulation commande (client)
│   ├── admin.js        ← API admin sécurisée
│   └── lead.js         ← Formulaire de devis
└── README.md           ← Ce fichier
```

---

## Étape 1 — Créer les comptes (tous gratuits)

### 1A. Vercel
1. Va sur **vercel.com** → « Sign Up » avec GitHub
2. Crée un compte GitHub si tu n'en as pas (github.com)

### 1B. Stripe
1. Va sur **stripe.com** → Créer un compte
2. Active ton compte (vérification d'identité requise pour les vrais paiements)
3. En mode **test**, tu peux tout tester sans vérification

### 1C. Resend (emails)
1. Va sur **resend.com** → Créer un compte gratuit (3 000 emails/mois offerts)
2. Ajoute et vérifie ton domaine (ex: `lecomptoir-atelier.fr`) → Suivre le guide Resend
3. Crée une **API Key** → note-la

### 1D. Vercel KV (base de données)
Sera créé directement depuis Vercel à l'étape 3.

---

## Étape 2 — Préparer les clés secrètes

Tu as besoin de ces 8 valeurs :

| Variable | Où la trouver |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks (créé à l'étape 4) |
| `RESEND_API_KEY` | Resend → API Keys |
| `ADMIN_PASSWORD` | Mot de passe admin de ton choix (ex: `MonMotDePasse2026!`) |
| `ADMIN_SECRET` | Token secret de ton choix — chaîne aléatoire longue (ex: `xK9p2mQ7vL4...`) → génère sur [generate-secret.vercel.app](https://generate-secret.vercel.app/32) |
| `SHOP_EMAIL` | Ton email de réception (`salut@lecomptoir-atelier.fr`) |
| `SITE_URL` | Ton URL Vercel (ex: `https://lecomptoir.vercel.app`) |
| `KV_REST_API_URL` | Fourni automatiquement par Vercel KV |
| `KV_REST_API_TOKEN` | Fourni automatiquement par Vercel KV |

---

## Étape 3 — Déployer sur Vercel

### 3A. Mettre le code sur GitHub
1. Sur **github.com** → « New repository » → nom : `le-comptoir`
2. Glisse ton dossier `le-comptoir/` dans le repo (bouton « uploading an existing file »)
3. Valide (« Commit changes »)

### 3B. Importer sur Vercel
1. Sur **vercel.com** → « Add New Project » → importe ton repo GitHub `le-comptoir`
2. Vercel détecte automatiquement le `vercel.json`
3. **Avant de déployer**, clique sur « Environment Variables » et ajoute :
   - `STRIPE_SECRET_KEY` → ta clé Stripe (sk_live_... ou sk_test_...)
   - `RESEND_API_KEY` → ta clé Resend
   - `ADMIN_PASSWORD` → ton mot de passe admin
   - `ADMIN_SECRET` → ton token secret
   - `SHOP_EMAIL` → salut@lecomptoir-atelier.fr
   - `SITE_URL` → https://lecomptoir.vercel.app *(tu le sauras après le 1er déploiement)*
4. Clique « Deploy »

### 3C. Créer la base de données KV
1. Dans Vercel → ton projet → onglet « Storage »
2. « Create Database » → choisir **KV**
3. Clique « Connect to Project » → les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` sont ajoutées automatiquement
4. Fais un **redéploiement** : Deployments → les 3 points → « Redeploy »

### 3D. Mettre à jour SITE_URL
Maintenant que tu connais ton URL :
1. Settings → Environment Variables → modifie `SITE_URL` avec l'URL réelle
2. Redéploie encore une fois

---

## Étape 4 — Configurer le webhook Stripe

Le webhook permet à Stripe de notifier ton site quand un paiement est confirmé.

1. Va sur **Stripe** → Developers → Webhooks
2. « Add endpoint »
3. URL : `https://ton-site.vercel.app/api/webhook`
4. Events à écouter : sélectionne `checkout.session.completed`
5. Clique « Add endpoint »
6. Dans la page du webhook → « Signing secret » → copie-le
7. Dans Vercel → Settings → Environment Variables → ajoute `STRIPE_WEBHOOK_SECRET`
8. Redéploie

---

## Étape 5 — Tester en mode test Stripe

1. Sur ton site, ajoute un produit au panier
2. Lance le paiement → entre le numéro de carte de test Stripe : `4242 4242 4242 4242` (n'importe quelle date future, n'importe quel CVC)
3. Vérifie :
   - ✅ Redirection vers le site après paiement
   - ✅ Email de confirmation reçu
   - ✅ Lien de suivi fonctionnel dans l'email
   - ✅ Commande visible dans l'admin

---

## Fonctionnalités incluses

### Pour le client
- 🛒 Panier avec calcul livraison automatique (offerte dès 50 €)
- 💳 Paiement sécurisé Stripe (CB, no compte requis)
- 📧 Email de confirmation avec lien de suivi unique
- 📦 Suivi commande en temps réel (confirmée → préparation → expédiée → livrée)
- ❌ Annulation possible depuis le lien de suivi (si pas encore expédiée)
- 📝 Formulaire de devis avec email de confirmation

### Pour l'admin
- 🔐 Connexion sécurisée par mot de passe (API, pas localStorage)
- 📋 Tableau des commandes avec statut, client, produits, total
- 🔄 Changement de statut des commandes (avec email automatique au client)
- 📦 Numéro de suivi Colissimo (envoyé par email au client quand statut = Expédiée)
- 📬 Gestion des demandes de devis
- ✏️ Modification complète du contenu du site (hero, services, tarifs, avis, produits...)
- 🗑️ Suppression de commandes et demandes

### Emails automatiques
| Déclencheur | Email envoyé à |
|---|---|
| Paiement confirmé | Client + Admin |
| Annulation client | Client + Admin |
| Statut → En préparation | Client |
| Statut → Expédiée | Client (avec N° Colissimo si renseigné) |
| Statut → Livrée | Client |
| Formulaire devis | Client + Admin |

---

## Accès admin

- **URL** : N'importe quelle page → clic sur le petit point orange en bas à droite du footer
- **Raccourci clavier** : Ctrl + Shift + C
- **Mot de passe** : celui que tu as défini dans `ADMIN_PASSWORD`

---

## Passer en production (vrais paiements)

1. Dans Stripe, clique « Activate your account » et complète la vérification
2. Remplace `STRIPE_SECRET_KEY` par ta clé **live** (`sk_live_...`)
3. Crée un nouveau webhook avec ta clé live (`whsec_...`) → mets à jour `STRIPE_WEBHOOK_SECRET`
4. Dans ton site, la clé **publique Stripe** n'est pas nécessaire car on utilise Stripe Checkout hosted
5. Redéploie → c'est tout

---

## Coûts

| Service | Coût |
|---|---|
| Vercel | Gratuit (Hobby plan) |
| Vercel KV | Gratuit jusqu'à 256 MB, 30 000 req/mois |
| Resend | Gratuit jusqu'à 3 000 emails/mois |
| Stripe | 0 € fixe + 1,5% + 0,25 € par transaction (carte EU) |
| Domaine | ~10 €/an (Namecheap, OVH...) |

---

## Domaine personnalisé (optionnel)

1. Achète ton domaine chez OVH, Namecheap, etc.
2. Dans Vercel → Settings → Domains → ajoute ton domaine
3. Suis les instructions DNS (ajoute un enregistrement CNAME chez ton registrar)
4. Met à jour `SITE_URL` dans les variables Vercel
5. Dans Resend, vérifie aussi que ton domaine d'envoi est configuré

---

## Questions fréquentes

**Le webhook ne reçoit pas les events Stripe en local ?**
→ Normal, les webhooks nécessitent une URL publique. Utilise [Stripe CLI](https://stripe.com/docs/stripe-cli) pour les tests en local : `stripe listen --forward-to localhost:3000/api/webhook`

**Comment changer le mot de passe admin ?**
→ Dans Vercel → Settings → Environment Variables → modifie `ADMIN_PASSWORD` → Redéploie

**Comment rembourser manuellement un client ?**
→ Stripe Dashboard → Payments → trouve la transaction → « Refund »

**Les emails arrivent dans les spams ?**
→ Vérifie que tu as bien configuré le DNS de ton domaine dans Resend (SPF, DKIM). Ça résout 99% des problèmes de délivrabilité.
