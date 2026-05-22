---
name: refonte-page-kotona
description: Use this skill when the user wants to refondre/redesign one or more pages on the Kotona Vision WordPress site (kotonavision.com), either as a single page or in batch mode. Triggers on phrases like "refonte page X", "refondre /slug/", "refais la page Y", "refonte de la home", or any request involving applying the KV Elementor template library to existing pages. Specific to the project at ~/Projects/kv-refonte/.
---

# Refonte page Kotona Vision — workflow v3

Prompt opérationnel pour reconstruire une ou plusieurs pages Elementor du site **kotonavision.com** en s'appuyant **exclusivement** sur la bibliothèque de templates KV. Adapté pour Claude Code (Node + API REST WordPress avec Basic Auth Application Password).

> ⚠️ **Version v3** : remplace les références obsolètes du prompt v2 (notamment l'ID 2690 du "Hero centré" qui n'existe plus), ajoute la contrainte "Hero dark = homepage only" validée par audit structurel, et intègre les exclusions périmètre (pages Microsoft droppées).

---

## Contexte technique

- **Site cible** : `https://stagging.kotonavision.com` (staging)
- **Auth** : Basic Auth via Application Password (cf. `~/Projects/kv-refonte/.env`)
- **Source unique des blocs** : bibliothèque Elementor KV (11 templates, préfixe "KV", IDs 2471–2695)
- **CMS** : WordPress + Elementor + WPML (FR/EN)
- **Scripts disponibles** dans `~/Projects/kv-refonte/scripts/` :
  - `list-kv-library.js` — liste la bibliothèque KV à jour
  - `list-pages.js --lang=fr|en` — liste les pages d'une langue
  - `inspect-page.js --slug=<slug>` — détaille structure + backup auto
  - `audit-pages.js --lang=fr|en` — audit en masse, génère rapport Markdown
  - `match-templates.js --slug=<slug>` — fingerprinting structurel vs KV templates

---

## Bibliothèque KV (recharger au début de chaque mission)

Charger via `node scripts/list-kv-library.js`. État à jour (2026-05-22) :

| ID | Nom | Signature widgets |
|---:|---|---|
| 2471 | Hero dark 2col | 2×button, 1×heading, 1×text-editor |
| 2474 | 3 piliers offres | 10×heading, 3×text-editor, 3×icon-list, 3×button |
| 2480 | Logos clients | 1×heading, 1×html |
| 2483 | CTA contact final | 1×heading, 1×text-editor, 1×button |
| 2521 | FAQ accordion | 1×heading, 1×text-editor, 1×accordion, 1×html |
| 2524 | Industries accordion | 1×heading, 1×accordion |
| 2556 | Offre accompagnement 75$ | 13×heading, 6×text-editor, 1×button |
| 2559 | Stats écosystème | 5×heading, 4×counter |
| 2565 | Pourquoi Kotona vision | 8×heading, 4×text-editor |
| 2694 | Catalogue cards | 10×heading, 9×text-editor |
| 2695 | Pain points | 7×heading, 6×text-editor |

---

## Contraintes périmètre Kotona

### ✅ Dans le périmètre
Pages SolidWorks, 3DExperience, services techniques, pages institutionnelles non Microsoft.

### ❌ Hors périmètre (Microsoft) — NE PAS TOUCHER
- `microsoft-365` (#37) / `microsoft-365` EN (#1185)
- `microsoft-copilote` (#41) / `microsoft-copilot` EN (#1216)
- `microsoft-azur` (#443) / `microsoft-azure` EN (#1211)
- `power-plateforme` (#39) / `power-platform` EN (#1196)
- `services-microsoft-prestation-sur-mesure` (#65) / `custom-services-microsoft` EN (#1172)
- `pack-becloud` (#63) / `becloud-package` EN (#1203) — **à confirmer avec utilisateur**

### ⚪ Hors périmètre (fonctionnel)
- `confidentialite` (#3) / `privacy-policy` EN (#1236) — conserver tel quel
- `nous-contacter` (#43) / `contact-us` EN (#1195) — déjà refondue séparément
- `blogue` (#1531) / `blog` EN (#1654) — hub, traitement spécifique

### 🎯 Règle "Hero dark 2col" (#2471)
**UNIQUEMENT sur la homepage** (#2 FR `/` et #1255 EN `/en/`). Les autres pages refondues utilisent un **Hero custom** (dérivé du KV Hero dark : 2 colonnes, fond sombre, mais 2 widgets html ajoutés pour contenu enrichi). Si une demande implique de mettre Hero dark sur une autre page, **demander confirmation explicite**.

---

## Workflow standard

### Étape 1 — Audit structurel automatique (read-only)

```bash
cd ~/Projects/kv-refonte && node scripts/match-templates.js --slug=<page-slug>
```

Identifie les sections actuelles qui matchent déjà un KV template :
- `🎯 fort` (≥70% similarité) = section déjà refondue, **NE PAS toucher sauf demande explicite**
- `~ possible` (≥40%) = section semi-refondue, à examiner
- `? custom` (<40%) = section non-KV, candidate à refonte

### Étape 2 — Inspection détaillée + backup

```bash
node scripts/inspect-page.js --slug=<page-slug> --lang=fr
```

Affiche : ID, slug, titre, URL, lang, structure (sections + 1er heading par section), décompte widgets. **Crée automatiquement un backup JSON dans `backups/`**.

### Étape 3 — Proposition de mapping (MODE SINGLE)

Format à présenter à l'utilisateur :

```
| # | Section actuelle | Action     | Template KV cible | Adaptations         | Risques |
|---|------------------|------------|--------------------|---------------------|---------|
| 1 | Hero custom      | garder     | (déjà KV-like)     | -                   | -       |
| 2 | Présentation     | remplacer  | KV Pain points     | Adapter 7 headings  | -       |
| 3 | Services         | remplacer  | KV 3 piliers       | -                   | -       |
| 4 | CTA téléphone    | supprimer  | -                  | (CTA tel à virer)   | -       |
```

Actions possibles : `garder` · `remplacer` · `créer` (nouveau template KV à proposer) · `supprimer` · `fusionner`

**Attendre approbation explicite (oui/go) avant de continuer.**

### Étape 4 — Build (POST REST)

Une fois approuvé :
1. Backup du `_elementor_data` actuel via `lib/pages.js → backupPage()`
2. Charger les templates KV cibles via `lib/templates.js → getTemplate(id)`
3. Composer le nouveau `_elementor_data` (assembler les sections KV + contenus existants à substituer)
4. **Régénérer les IDs Elementor** via `lib/elementor.js → regenIds()` pour éviter les collisions
5. POST sur `/wp-json/wp/v2/pages/<id>` via `lib/pages.js → updatePage()`
6. Trigger CSS regen — actuellement on s'appuie sur la régen au prochain edit Elementor (à améliorer)

### Étape 5 — Validation + tracking

1. Visiter l'URL frontend (manuellement ou via screenshot Playwright si configuré)
2. Si OK : update du tableau Notion **"Avancement de la refonte"**
   - URL : https://www.notion.so/366c729eda1c8148866cdf5c05343ab4
   - Colonne "Structure KV (auto)" : ex `9/10 ✅`
   - Statut : 🔴 → 🟡 (DS/SEO à finaliser) ou 🟢 (tout OK)
3. Commit + push du backup JSON dans `backups/`

---

## Mode BATCH (≥2 URLs)

Pour traiter plusieurs pages d'un coup :

1. **AUDIT CONSOLIDÉ** : un tableau par page (format single)
2. **MAPPING CONSOLIDÉ** unique :

```
| Page | # | Section actuelle | Action | Template KV | Adaptations | Risques |
```

3. **SYNTHÈSE TRANSVERSE** :

```
| Page | Slug | URL | Sections avant | Sections après | Templates utilisés | Risques |
```

4. **Templates KV manquants détectés** → bloc de création préalable, validation en une fois
5. **Approbation globale** du batch
6. **BUILD séquentiel** : un POST par page, backup auto
7. **LIVRAISON** :

```
| Page | Statut | URL | Backup ID | Captures |
```

---

## Design system (non négociable)

- **Polices** : Inter 400-800 (body) + Fraunces italic (mots-clés dorés UNIQUEMENT)
- **Palette** :
  - Paper `#F4EFE6` · Sand `#E3DCCB` · Sand2 `#E8DFCB`
  - Ink `#1C1D1F` · Graphite `#3A3B3E`
  - Gold `#C9A35C` · Gold-deep `#B88C3F`
- **Container** : 1280px max, padding 96px / 56px
- **Cards** : radius 14-16px
- **Eyebrow** : barre dorée 32×2px + Inter caps 11px tracking 0.20em
- **Italique doré Fraunces** : UN seul mot-clé par H1/H2 (pas plus)
- **CSS Grid 3 colonnes** pour templates avec ≥4 enfants (breakpoints 2 col `< 1024px`, 1 col `< 600px`)

### ❌ Interdits
- Nunito (l'ancienne typo)
- Vert / teal (#45AFAD est OUT)
- Shape dividers vagues
- Images décoratives inutiles
- Flex + width % pour grilles ≥4 enfants (utiliser CSS Grid)

---

## Contenu

- **Récupérer tous les textes existants** de la page d'origine
- **Ne pas changer la substance**, reformulation marginale uniquement
- **Préserver les shortcodes spéciaux** : `[sw_maintenance_calculator]` etc.

---

## Aucune modification de
- Header / nav / logo
- Footer
- CTAs téléphone (à supprimer si rencontrés dans une section refondue)
- Pages hors scope (listées ci-dessus)

---

## Cas non couverts

Si un type de section nécessaire n'a pas d'équivalent dans la bibliothèque KV :
1. **STOP — signaler à l'utilisateur AVANT de continuer**
2. Proposer :
   - (a) Créer un nouveau template KV nommé `KV [type]` dans la bibliothèque
   - (b) Adapter un template KV proche
3. Attendre la décision

---

## Amélioration continue

À l'issue de chaque page refondue, proposer 1–3 axes d'amélioration du prompt ou du workflow (à intégrer dans la skill ou les scripts).
