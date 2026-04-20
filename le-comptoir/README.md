# Le Comptoir — Guide de déploiement v2

## ⚠️ IMPORTANT — Cette version utilise Gmail au lieu de Resend
Pas besoin de nom de domaine. Tu peux utiliser ton Gmail normal avec un "mot de passe d'application".

---

## Variables d'environnement à mettre sur Vercel

| Nom | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | Ta clé Stripe secrète (commence par `sk_test_...` ou `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Secret de signature du webhook Stripe (`whsec_...`) — voir étape 3 |
| `ADMIN_PASSWORD` | Le mot de passe admin de ton choix |
| `ADMIN_SECRET` | Chaîne aléatoire longue — génère sur [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32) |
| `GMAIL_USER` | Ton adresse Gmail complète (ex: `forge.idf@gmail.com`) |
| `GMAIL_APP_PASSWORD` | Mot de passe d'application Google (pas ton mot de passe normal) — voir étape 2 |
| `SHOP_EMAIL` | L'email qui reçoit les notifications admin (peut être le même que GMAIL_USER) |
| `SITE_URL` | Ton URL Vercel complète (ex: `https://le-comptoir-sigma.vercel.app`) |
| `KV_REST_API_REDIS_URL` | URL de ta base Redis (fournie par Vercel) |

**IMPORTANT** : toutes les variables doivent être en mode **"Plain text"** (PAS "Reference a Secret").

---

## Étape 1 — Configurer Gmail pour envoyer des emails

Google n'autorise plus les mots de passe normaux pour Nodemailer. Il te faut un **mot de passe d'application**.

### 1.1 Active la validation en 2 étapes (obligatoire)
1. Va sur [myaccount.google.com/security](https://myaccount.google.com/security)
2. Section **Validation en 2 étapes** → active-la si pas déjà fait

### 1.2 Génère un mot de passe d'application
1. Sur la même page → cherche **"Mots de passe des applications"** (ou va directement sur [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords))
2. Dans **"Nom de l'application"** tape : `Le Comptoir Vercel`
3. Clique **Créer**
4. Google affiche un mot de passe de 16 caractères type `abcd efgh ijkl mnop`
5. **Copie-le EN ENLEVANT les espaces** → ça donne `abcdefghijklmnop`

### 1.3 Mets-le dans Vercel
- `GMAIL_USER` = ton adresse Gmail complète
- `GMAIL_APP_PASSWORD` = le mot de passe 16 caractères (sans les espaces)

---

## Étape 2 — Configurer le webhook Stripe

Sans ça, les commandes ne s'enregistrent pas et les emails ne partent pas.

### 2.1 Crée l'endpoint webhook
1. [dashboard.stripe.com](https://dashboard.stripe.com) → Mode **Test** (toggle en haut)
2. Menu gauche **Développeurs** → **Webhooks**
3. Bouton **Ajouter un endpoint**
4. URL de l'endpoint : `https://TON-SITE.vercel.app/api/webhook`
5. Événements à écouter : coche **`checkout.session.completed`**
6. Clique **Ajouter un endpoint**

### 2.2 Récupère le Signing secret
1. Sur la page du webhook créé
2. Section **Signing secret** → clique **Révéler**
3. Copie la valeur qui commence par `whsec_...`

### 2.3 Mets-le dans Vercel
- `STRIPE_WEBHOOK_SECRET` = la valeur `whsec_...`

---

## Étape 3 — Déployer

1. Upload les fichiers dans ton repo GitHub
2. Vercel détecte le commit et redéploie
3. Attends que le déploiement soit **Ready** (vert)

---

## Accès admin

- **Petit point orange** en bas à droite du footer (dans le bandeau noir)
- **Raccourci** : `Ctrl + Shift + C`
- Mot de passe : celui de `ADMIN_PASSWORD`

---

## Tester le flux complet

1. Site en **navigation privée**
2. Ajoute un produit au panier → **Commander**
3. Remplis tes infos → **Payer par carte**
4. Sur Stripe : utilise la carte de test `4242 4242 4242 4242`, date future (ex 12/30), CVC au choix (ex 123)
5. Après paiement :
   - ✅ Tu reviens sur le site
   - ✅ Tu reçois un email (vérifie les spams)
   - ✅ L'admin voit la commande dans l'onglet Commandes boutique
   - ✅ Tu peux changer le statut (en préparation → expédiée → livrée) → client reçoit un email à chaque changement

---

## En cas de problème

### Les emails n'arrivent pas
- Vérifie que `GMAIL_APP_PASSWORD` est le bon (sans espaces)
- Vérifie tes spams
- Va sur Vercel → Logs → cherche "Mail" pour voir les erreurs

### Les commandes ne s'enregistrent pas après paiement
- Vérifie que le webhook Stripe pointe bien vers `/api/webhook`
- Vérifie que `STRIPE_WEBHOOK_SECRET` est bien copié
- Sur Stripe → Webhooks → ton endpoint → onglet "Tentatives récentes" pour voir les erreurs

### L'admin refuse le mot de passe
- Vérifie que `ADMIN_PASSWORD` est bien dans Vercel (sans espaces)
- Vérifie que `ADMIN_SECRET` est bien défini aussi (obligatoire pour stocker le token côté client)

---

## Coûts

| Service | Coût |
|---|---|
| Vercel | Gratuit (Hobby plan) |
| Redis Vercel | Gratuit jusqu'à 30 MB |
| Gmail | Gratuit — 500 emails/jour |
| Stripe | 1,5% + 0,25 € par transaction carte EU |
| Domaine perso | ~10 €/an (OVH, Namecheap...) — optionnel |
