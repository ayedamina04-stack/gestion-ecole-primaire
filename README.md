# Gestion d'école primaire — v0.2 (connexion + tableau de bord)
Backend Node/Express + PostgreSQL, frontend React (Vite) dans `client/`, servi par le même serveur.

## Lancer sur Windows (local)
1. Installer Node.js 20+ (nodejs.org, version LTS) et PostgreSQL (postgresql.org/download/windows ; retenez le mot de passe de l'utilisateur `postgres`).
2. Dans pgAdmin (ou `psql`), créer une base nommée `ecole`.
3. Ouvrir PowerShell dans ce dossier :
   `copy .env.example .env` puis ouvrir `.env` avec le Bloc-notes et renseigner :
   `DATABASE_URL=postgresql://postgres:VOTRE_MOT_DE_PASSE@localhost:5432/ecole`, `JWT_SECRET` et `SETUP_TOKEN` (deux longues chaînes au hasard). Laisser `NODE_ENV=development`.
4. `npm install`
5. `npm run build`   (compile l'interface React)
6. `npm run migrate` (crée les tables)
7. `npm start` puis ouvrir http://localhost:3000
8. Au premier lancement, la page « Première installation » demande le SETUP_TOKEN pour créer l'administrateur.

Mode développement (rechargement automatique) : deux terminaux, `npm run dev:api` et `npm run dev:client`, puis http://localhost:5173.

## Déploiement Railway
Pousser sur GitHub > Railway > Deploy from repo. Ajouter PostgreSQL ; variables : `DATABASE_URL`, `JWT_SECRET`, `SETUP_TOKEN`, `NODE_ENV=production`.
Build : `npm install && npm run build`. Démarrage : `npm run migrate && npm start`. Healthcheck : `/health`.

## v0.3 — Élèves et Classes
Aucune migration nécessaire. Après `git pull`/décompression : `npm run build` puis `npm start`.
Test : connectez-vous en admin > Classes > « Nouvelle année scolaire » (active) > créez un compte Enseignant (Comptes utilisateurs) > ajoutez une classe > Élèves > ajoutez un élève > ouvrez sa fiche > « Affecter ».
