# IA Studio - suivi de commandes

Ce Worker Cloudflare crée une session Stripe Checkout, reçoit uniquement les événements Stripe signés, conserve les commandes dans D1 et rend le suivi visible dans `../admin/` après authentification.

## Déploiement sécurisé

1. Connecter son compte Cloudflare dans un terminal : `npx wrangler login`.
2. Dans `backend/`, créer la base : `npx wrangler d1 create ia-studio-orders` puis reporter l'identifiant dans `wrangler.toml`.
3. Appliquer le schéma : `npx wrangler d1 execute ia-studio-orders --remote --file=./schema.sql`.
4. Déployer une première fois : `npx wrangler deploy`. Copier l'URL `workers.dev` dans `../admin/index.html` et dans le script de la page de vente.
5. Ajouter les secrets uniquement dans Cloudflare : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.
6. Dans Stripe, créer un webhook vers `https://<worker>.workers.dev/webhooks/stripe` et sélectionner `checkout.session.completed` et `checkout.session.async_payment_succeeded`. Copier le secret de signature dans Cloudflare.

Ne jamais déposer une clé Stripe, un mot de passe ou un secret de webhook dans GitHub, un fichier HTML, un e-mail ou cette conversation.

## À vérifier avant toute vente

Le site doit avoir ses mentions légales, CGV, politique de confidentialité et règles de rétractation applicables avant mise en production. Le webhook est la source de vérité : la page de confirmation seule ne prouve pas un paiement.
