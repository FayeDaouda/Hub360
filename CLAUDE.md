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
- Dates (heure de Dakar), montants et texte : une seule version, dans le
  paquet `@hub/domain` (`docs/adr/0004-paquet-partage-domain.md`) ; le
  recompiler (`npm run build` dans `packages/domain`) après l'avoir modifié.
- Contrat d'API : `backend/openapi.json` et `frontend/lib/api/schema.d.ts`
  sont générés (`docs/adr/0005-contrat-api-openapi.md`) ; après un changement
  de route ou de DTO, `npm run build && npm run openapi` (back) puis
  `npm run api:types` (front). Les DTO vivent dans des fichiers `*dto.ts`.
- Une branche et une pull request par lot ; Conventional Commits.
- Avant de conclure qu'une modification ne change rien : tests unitaires et
  e2e du back, captures et tests de fumée (`e2e/`, voir son `package.json`).

## Workflow de modification

Les agents cités sont ceux de l'utilisateur (`~/.claude/agents/`), pas du dépôt.

1. Toujours proposer un plan avant de coder, et attendre la validation.
2. Après chaque modification, lancer `code-reviewer`.
3. Lancer `security-auditor` si la modification touche aux rôles, aux
   permissions, aux finances, à la RH, aux contrats ou aux données
   personnelles.
4. Pas de `ui-reviewer` (retiré le 09/11/2026 : trop lent et trop coûteux) ;
   un écran créé ou modifié se vérifie par quelques captures prises
   directement (bureau et téléphone, clair et sombre).
5. Lancer `test-writer` si une logique métier change.
6. Corriger les points Critique et Haute, lancer tous les tests, puis
   présenter un résumé avant le commit. Ne jamais pousser ni fusionner sans
   accord explicite, même pour une PR sans changement de comportement.
