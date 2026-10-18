# Tontine 2.0

Version parallèle et **indépendante** du Gestionnaire de Tontines (dépôt `tontine`).

## Différences avec la première version
- **Aucune pièce d'identité** : pas de numéro CNI dans les fiches, les listes, les exports, les fiches de remise ni les relevés. Si vous importez une ancienne sauvegarde, les numéros CNI sont supprimés automatiquement.
- **Données séparées** : Tontine 2.0 enregistre ses données sous ses propres noms (`tontine2.*`, copies `tontine2-copies`). Les deux applications peuvent tourner sur le même téléphone sans se mélanger.
- **Compte de sauvegarde modifiable** (Paramètres → Sauvegarde) : Google Drive (adresse Gmail), e-mail ou WhatsApp. Le bouton « 🔁 Changer de compte » remplace le compte. Les anciens comptes restent listés avec leurs dates, pour retrouver les sauvegardes déjà envoyées.

Toutes les autres fonctions sont celles de la v6 : formules de parts, tirage au sort, retards, remises, dossiers membres, observations, rappels WhatsApp, affiches, copies automatiques.

## Publication (GitHub Pages)
1. Créez un nouveau dépôt `tontine2` sur GitHub.
2. Envoyez le contenu de ce dossier.
3. Settings → Pages → branche `main`, dossier `/docs`.
4. Adresse : `https://bmdcode.github.io/tontine2/`

Les données restent dans l'appareil. Ne publiez jamais de fichier de sauvegarde `.json` dans le dépôt.
