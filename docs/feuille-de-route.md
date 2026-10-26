# Feuille de route du chantier « nettoyage et structuration »

Document vivant : état des phases, suites décidées, propositions en attente de
décision. Rapport d'audit initial : `docs/audit/2026-10-24-audit-initial.md`.
Décisions structurantes : `docs/adr/`.

## Phases

| Phase                 | Contenu                                                                                                                                                                     | État             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 0 — Filet de sécurité | environnement de référence, 232 captures, tests de fumée                                                                                                                    | fait (PR #1)     |
| 1 — Audit             | rapport chiffré, plan                                                                                                                                                       | fait (PR #1)     |
| 2 — Sécurité          | dépendances (0 vulnérabilité), isolation entre sociétés (ADR 0001), fichiers par usage, configuration validée, en-têtes et CSP à nonce, ordre du journal d'audit (ADR 0002) | fait (PR #2)     |
| Formatage             | Prettier sur tout le dépôt, en un commit ignoré par `git blame`                                                                                                             | en revue (PR #3) |
| Structuration         | module par module : `features/<module>/`, composants d'interface uniques, règles métier au back, renommage en anglais (commentaires en français, `@map` en base)            | à venir          |
| Types partagés        | OpenAPI généré depuis le back, client typé pour le front ; `packages/domain` limité aux schémas de formulaires, au formatage et aux constantes                              | à venir          |
| Documentation         | `README.md`, `ARCHITECTURE.md`, `docs/glossaire.md`, `CLAUDE.md`                                                                                                            | à venir          |

## Suites décidées, pas encore faites

- **Montants saisis** : refuser les décimales avec un message clair dès la
  saisie, sauf pour les pourcentages (décision n° 4).
- **Turbopack** : corriger les écarts CSS qu'il produit (58 écrans), puis
  abandonner `--webpack`.
- **NestJS 12** : publié en ESM uniquement ; migrer d'abord le back et Jest en
  ESM.
- **Règles React Compiler** : 53 avertissements, corrigés module par module
  pendant la structuration, puis remis en erreur.
- **Tournée des rappels** : la découper par société (aujourd'hui en périmètre
  système, ADR 0001).
- **Capture instable** : pastille « Projets » en mobile (lissage du texte).

## En attente d'une décision extérieure

- **Périmètre RH** (direction) : commun aux quatre sociétés ou propre à
  chacune ; puis permission explicite « vue groupe » en lecture, avec journal
  des accès (ADR 0001).
- **Liens publics** (direction) : devis valable jusqu'à sa date de validité,
  contrat actif jusqu'à la signature puis lecture seule limitée, révocation et
  régénération.
- **Formats BIM** (équipe) : Revit, ArchiCAD, SketchUp pour les livrables.

## Défaut corrigé

**Émissions de factures simultanées** (corrigé le 26/10/2026, ADR 0003) :
au-delà de 5 émissions simultanées pour une même société, l'une pouvait
échouer. Les émissions d'une société sont désormais sérialisées par un verrou
par année ; test avec 20 émissions simultanées, stable sur 10 passages.

## Proposition à décider : journal d'événements en ajout seul

Aujourd'hui, le journal d'audit est **reconstruit** à la lecture à partir des
dates des tables métier (ADR 0002). Conséquences : seuls les événements
prévus d'avance y figurent, les valeurs avant modification sont perdues (sauf
cas particuliers comme le profil de facturation, versionné), et un événement
disparaît si sa ligne métier est modifiée ou supprimée.

Proposition, pour la phase de structuration :

- **Une table `evenements` en ajout seul** : qui (compte, rôle, société), quoi
  (type d'action, entité, identifiant), quand (horodatage de la base +
  séquence), valeurs avant et après (JSON des champs modifiés), et le contexte
  utile (route, motif saisi).
- **Écrite dans la même transaction** que la modification métier, par un
  service unique appelé par les services de domaine (explicite, relu en revue)
  plutôt que par une interception automatique de toutes les écritures (trop de
  bruit, et difficile à rendre lisible).
- **Inaltérable** : ni `UPDATE` ni `DELETE` permis (droits PostgreSQL du
  compte applicatif + déclencheur de refus), conservation définie avec la
  direction.
- **Données sensibles exclues** des valeurs avant/après par liste blanche de
  champs : jamais un salaire ni un montant de paie, comme le journal actuel.
- **Lecture** : Pilotage › Journal lit cette table, filtrée par société
  (ADR 0001) ; l'export reste le même.
- **Transition** : le journal reconstruit reste la source pour l'historique
  antérieur ; les deux coexistent le temps de vérifier l'exhaustivité.

Points à trancher : liste des événements journalisés (tous les changements de
données métier, ou une liste fermée), durée de conservation, accès (CEO et CIO
comme aujourd'hui ?), et coût de stockage des valeurs avant/après.
