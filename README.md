# identite-ts 🇫🇷

> Une bibliothèque TypeScript légère et côté client pour extraire des données JSON structurées à partir de documents d'identité officiels français (CNI, Passeport, Carte Vitale) via une simple photo. Idéal pour l'auto-remplissage de formulaires dans les applications React, Vue, Svelte ou Angular.

## 🚀 L'Objectif

Remplir des formulaires d'identité (Nom, Prénom, Date de naissance...) est fastidieux et source d'erreurs. `identite-ts` résout ce problème en proposant une **solution 100% open-source, exécutée entièrement côté client** sous licence MIT.

Vos utilisateurs prennent une photo de leur document, et votre application reçoit instantanément un objet JSON structuré et fortement typé pour pré-remplir les champs.

### Points forts
- **100% Côté Client :** Pas de serveur intermédiaire, latence minimale et respect strict du RGPD (les données sensibles ne quittent pas le navigateur de l'utilisateur).
- **TypeScript First :** Des modèles de données typés pour chaque document officiel français.
- **Indépendant du Framework :** Compatible avec React, Vue, Svelte, Angular ou Vanilla JS.
- **Basé sur les normes officielles :** Conçu à partir des spécifications techniques de l'État français (zones MRZ, formats officiels).