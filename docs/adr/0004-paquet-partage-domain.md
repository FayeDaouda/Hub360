# ADR 0004 — Paquet partagé `@hub/domain` : une seule version des fonctions communes

- Statut : accepté (27/10/2026)
- Contexte de décision : décision n° 8 du chantier de structuration
  (25/10/2026, « `packages/domain` limité aux schémas de formulaires, au
  formatage et aux constantes ») et critère de fin de S0c
  (`docs/feuille-de-route.md`). Mise en œuvre : PR S0c, première partie.

## Contexte

Après S0a, les fonctions de dates, de montants et de texte existaient en deux
copies, `frontend/lib/{dates,format,text}.ts` et
`backend/src/shared/{dates,format,text}.ts`, tenues identiques à la main. Une
seule différence s'était glissée : `formatDayShortMonth` suivait le fuseau
de l'appareil au back et celui de Dakar au front (la version du back n'était
appelée nulle part).

L'audit (`docs/audit/2026-10-24-audit-initial.md`) proposait un monorepo en
espaces de travail npm (`workspaces`), avec un seul lockfile à la racine.

## Décision

1. **Un paquet `packages/domain`**, publié nulle part (`private`), nommé
   `@hub/domain`, importé par un point d'entrée unique :
   `import { formatDate, plural } from '@hub/domain'`. Il contient les
   fonctions de dates (heure de Dakar), de montants et de texte, et leurs
   tests. Les copies du front et du back sont supprimées.
2. **Une dépendance locale** dans chaque application :
   `"@hub/domain": "file:../packages/domain"` (lien symbolique dans
   `node_modules`). Le back, le front et e2e gardent chacun leur
   `package.json` et leur lockfile.
3. **Un paquet compilé** : `npm run build` produit `dist/` en CommonJS avec
   ses déclarations de types. Le back (CommonJS, Node) le charge tel quel ;
   le front (webpack) l'intègre au code des pages. Il est compilé avant le
   back et le front partout : crochet `pre-push`, CI (job dédié, puis avant
   chaque application), images Docker, environnements de référence e2e.
4. **Ses propres outils** : TypeScript, Vitest et Vite, aux versions déjà
   utilisées par le front ; ses tests tournent avec un appareil réglé à
   UTC+14, comme ceux du front avant lui.
5. **Pas de règle métier** dans le paquet : elles restent calculées au back
   (décision n° 8). Il accueillera les schémas de formulaires et les
   constantes partagées au fil de la structuration.

## Alternatives écartées

- **Espaces de travail npm** (proposition de l'audit) : un lockfile unique à
  la racine et des dépendances remontées d'un niveau changent l'installation
  du back, du front, des images Docker et des environnements e2e en même
  temps. Le lien local donne le même résultat pour un seul paquet ; le
  passage aux espaces de travail reste possible si d'autres paquets
  arrivent.
- **Sources TypeScript partagées par alias de chemin** : Nest compile avec
  `tsc`, qui ne réécrit pas les alias et refuse les fichiers hors de `src/` ;
  il faudrait changer la compilation du back.
- **Paquet livré en TypeScript, compilé par chaque application** : possible
  pour le front (`transpilePackages`), pas pour le back sans changer sa
  compilation.

## Conséquences

- Après une modification de `packages/domain/src`, relancer
  `npm run build` dans `packages/domain` (le back et le front lisent `dist/`).
- Installation d'un poste : `npm ci` puis `npm run build` dans
  `packages/domain`, avant le back et le front (`README.md`).
- `formatDayShortMonth` suit l'heure de Dakar au back aussi ; sans effet
  aujourd'hui (aucun appel au back).
