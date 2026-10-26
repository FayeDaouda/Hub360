# Consignes du dépôt hub360°

Point d'entrée des consignes pour les assistants de code. Il renvoie aux
sources plutôt que de les recopier ; il sera complété à la phase de
documentation (`docs/feuille-de-route.md`).

## Front (Next.js 16)

Consignes officielles de Next.js, écrites et tenues à jour par `next dev` :

@frontend/AGENTS.md

Ici, le front est construit avec webpack (`next build --webpack`), pas
Turbopack : voir la feuille de route.

## Règles décidées

- Code (identifiants, fichiers) en anglais, commentaires en français ;
  renommage module par module pendant la structuration, `@map` en base.
- Un seul formateur : Prettier, configuration à la racine (`npm run format`).
- Isolation entre sociétés : `docs/adr/0001-isolation-multi-societes.md`
  (refus par défaut, `runInCompany`, `runInGroupScope`, `runAsSystem`).
- Ordre du journal d'audit : `docs/adr/0002-ordre-journal-audit.md`.
- Une branche et une pull request par lot ; Conventional Commits.
- Avant de conclure qu'une modification ne change rien : tests unitaires et
  e2e du back, captures et tests de fumée (`e2e/`, voir son `package.json`).
