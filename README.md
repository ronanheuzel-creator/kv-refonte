# kv-refonte

Scripts d'automatisation pour la refonte du site **kotonavision.com** via l'API REST WordPress / Elementor.

Cible : `https://stagging.kotonavision.com` (environnement de staging).

## Setup sur une nouvelle machine

Prérequis : Node 18+, git, un gestionnaire de mots de passe (Bitwarden).

```bash
# 1. Cloner le repo
git clone https://github.com/ronanheuzel-creator/kv-refonte.git
cd kv-refonte

# 2. Installer les dépendances
npm install

# 3. Créer le fichier .env à partir du template
cp .env.example .env

# 4. Ouvrir .env et coller les credentials depuis Bitwarden
#    (entrée "WP App Password - kv-refonte stagging")
open -e .env       # ou: nano .env

# 5. Vérifier que tout marche
node scripts/list-kv-library.js
```

Si tu vois la liste des templates Elementor → setup OK.

## Structure

```
kv-refonte/
├── lib/
│   ├── wp.js            # Client HTTP authentifié vers l'API WP REST
│   ├── templates.js     # Bibliothèque Elementor (CPT elementor_library)
│   ├── elementor.js     # Manipulation d'arbres Elementor (IDs, walk, ...)
│   └── pages.js         # Lecture / écriture / backup de pages WP
├── scripts/
│   └── list-kv-library.js   # Validation auth — liste les templates
├── backups/             # (gitignored) snapshots JSON avant chaque modif
├── screenshots/         # (gitignored) captures Playwright (étape 8)
├── .env                 # (gitignored) credentials WP — JAMAIS commit
└── .env.example         # template de .env (committé)
```

## Sécurité

- Le fichier `.env` n'est **jamais** committé (cf. `.gitignore`).
- Les credentials WP sont stockés dans **Bitwarden**, recopiés dans `.env` à chaque nouveau clone.
- Le mot de passe d'application WP peut être révoqué depuis `wp-admin/profile.php` à tout moment.

## Workflow multi-machines

| Machine | Comment ça marche |
|---|---|
| Mac perso (actuel) | Setup initial complet, push sur GitHub |
| Mac pro (à venir) | `git clone` + recréer `.env` depuis Bitwarden + `npm install` |

Pas de dossier synchronisé entre les machines : le repo git fait la sync du code, Bitwarden fait la sync des secrets.
