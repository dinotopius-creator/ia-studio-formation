# E-mail post-achat gratuit via Gmail

Le script envoie le guide PDF joint depuis le compte Gmail qui le déploie. Il est appelé uniquement par le Worker après un paiement Stripe vérifié.

## Mise en service

1. Téléverser `C:\Users\Kraam\OneDrive\Documents\New project\output\pdf\guide_post_achat_ia_studio.pdf` dans Google Drive, sans le rendre public. Copier son identifiant de fichier depuis son URL.
2. Ouvrir [script.google.com](https://script.google.com), créer un projet, remplacer le fichier `Code.gs` par le contenu de `Code.gs` ici, puis enregistrer.
3. Dans **Paramètres du projet** > **Propriétés du script**, créer :
   - `GUIDE_FILE_ID` : identifiant Drive du PDF ;
   - `MAIL_SHARED_SECRET` : une longue valeur aléatoire, identique à celle enregistrée comme secret `MAIL_SHARED_SECRET` dans Cloudflare.
4. Cliquer **Déployer** > **Nouveau déploiement** > type **Application Web** : exécuter en tant que le compte Gmail propriétaire, accès **Toute personne**. Autoriser l’accès Gmail et Drive lorsque Google le demande. Copier l’URL `/exec`.
5. Dans Cloudflare Worker `ia-studio-orders`, ajouter :
   - `MAIL_WEBHOOK_URL` : l’URL Apps Script `/exec` (variable simple) ;
   - `MAIL_SHARED_SECRET` : la même valeur que dans les propriétés Apps Script (Secret) ;
   puis déployer.

Ne pas rendre le PDF partageable publiquement : Apps Script y accède avec le compte propriétaire et l’ajoute seulement en pièce jointe aux acheteurs confirmés.
