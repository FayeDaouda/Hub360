# Feuille de route du chantier « nettoyage et structuration »

Document vivant : état des phases, suites décidées, propositions en attente de
décision. Rapport d'audit initial : `docs/audit/2026-10-24-audit-initial.md`.
Décisions structurantes : `docs/adr/`.

## Phases

| Phase                 | Contenu                                                                                                                                                                                                                                 | État                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 0 — Filet de sécurité | environnement de référence, 232 captures, tests de fumée                                                                                                                                                                                | fait (PR #1)                              |
| 1 — Audit             | rapport chiffré, plan                                                                                                                                                                                                                   | fait (PR #1)                              |
| 2 — Sécurité          | dépendances (0 vulnérabilité), isolation entre sociétés (ADR 0001), fichiers par usage, configuration validée, en-têtes et CSP à nonce, ordre du journal d'audit (ADR 0002)                                                             | fait (PR #2)                              |
| Formatage             | Prettier sur tout le dépôt, en un commit ignoré par `git blame`                                                                                                                                                                         | fait (PR #3)                              |
| S0 — Fondations       | S0a fonctions utilitaires, S0b composants d'interface, S0c client d'API généré (OpenAPI) : trois PR séparées                                                                                                                            | S0a fait (PR #7) ; S0b en cours           |
| Exploitation          | préproduction, sauvegardes automatiques avec restauration testée, suivi des erreurs en production                                                                                                                                       | juste après S0 : conditionne le lancement |
| Structuration         | module par module, du plus petit au plus gros : S1 Équipes, S2 Mes tâches et Mon espace, S3 Projets, S4 Finances, devis et contrats, S5 CRM, S6 RH, S7 Pilotage, Réglages, Groupe et chat ; peut se poursuivre l'application en service | à venir                                   |
| Refonte visuelle      | indigo, Geist, tuile neutre, verre réservé au chrome : on change les valeurs des tokens, puis on valide les nouvelles captures comme nouvelle référence                                                                                 | après la structuration, en lots séparés   |
| Documentation         | `README.md`, `ARCHITECTURE.md`, `docs/glossaire.md`, `CLAUDE.md`                                                                                                                                                                        | glossaire commencé                        |

## Règles de la structuration

- **Rendu identique au pixel près.** La structuration ne change rien à
  l'écran : les composants sont construits sur les tokens avec les valeurs
  actuelles. Une capture qui change est une régression à corriger. La refonte
  visuelle vient ensuite, en lots séparés : elle modifie les valeurs des tokens
  (un seul fichier) et valide une nouvelle référence de captures.
- **Critères de fin de chaque module :**
  - le module est dans `features/`, avec ses noms en anglais ;
  - aucun fichier de plus de 300 lignes, aucune copie de fonction utilitaire ;
  - les règles métier du module sont calculées au back et testées ;
  - chaque écran gère le chargement, le vide et l'erreur ;
  - des tests côté front sur les composants et les hooks principaux ;
  - les chiffres avant et après dans la description de la PR.
- **Routes de l'API inchangées** pendant la structuration (contrat public).
  Avant de sortir les applications macOS, Windows et iOS, introduire un
  préfixe de version (`/api/v1`) : une fois des applications installées, on
  ne peut plus changer une route sans casser les anciennes versions.
- **Types partagés** (S0c) : OpenAPI généré depuis le back, client typé pour
  le front ; `packages/domain` limité aux schémas de formulaires, au formatage
  et aux constantes, les règles métier restant calculées au back.
  **Critère de fin de S0c** : les fonctions de dates, de montants et de texte
  n'existent plus qu'en une version, dans le paquet partagé ; les copies de
  `frontend/lib/` (`dates.ts`, `format.ts`, `text.ts`) et de
  `backend/src/shared/` sont supprimées.

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
- **Lot accessibilité des fenêtres** : une règle unique, toutes les fenêtres
  se ferment avec Échap, sauf pendant un envoi (8 ne le font pas :
  `closeOnEscape={false}` les repère) ; le focus du clavier reste dans la
  fenêtre tant qu'elle est ouverte et revient sur le bouton qui l'a ouverte à
  la fermeture. Le composant commun (`components/ui/dialog.tsx`) ne fait ni
  l'un ni l'autre aujourd'hui (tests « état actuel » dans `dialog.spec.tsx`,
  à inverser) ; la confirmation (`ConfirmModal`) le fait déjà.
- **Référence coupée (onglet « Projets » de la vue Production, mobile)** :
  une référence a été prise avant la fin du rendu (1 118 px au lieu de
  3 051). Vérifié : les cartes arrivent avec le dossier, qui a un squelette ;
  pas d'import dynamique. Cause non établie : reproduction en cours
  (sonde rejouée), puis correction de la vraie cause. Attente des captures
  renforcée entre-temps.
- **Images sans dimensions** (défaut d'interface) : signature du contrat
  (`.contrat-signature`) et logo du document de facture (`.fd-logo`), dont la
  hauteur dépend de l'image chargée ; à corriger, avec captures avant/après.
- **Lot de microcopie** : remplacer les « (s) » par de vrais accords selon le
  nombre (« 1 facture émise », « 3 factures émises »), avec `lib/text.ts`.
  Changement de texte visible : lot à part, après la structuration.

## En attente d'une décision extérieure

- **Périmètre RH** (direction) : commun aux quatre sociétés ou propre à
  chacune ; puis permission explicite « vue groupe » en lecture, avec journal
  des accès (ADR 0001).
- **Liens publics** (direction) : devis valable jusqu'à sa date de validité,
  contrat actif jusqu'à la signature puis lecture seule limitée, révocation et
  régénération.
- **Formats BIM** (équipe) : Revit, ArchiCAD, SketchUp pour les livrables.

## Captures : règles du harnais

- Une requête de l'API qui échoue est retentée (3 essais). Chaque nouvelle
  tentative est consignée dans le rapport (annotation « nouvelle tentative ») ;
  le test échoue au-delà de 2 par test, ou si une requête échoue encore après
  son dernier essai : un échec qui se répète peut révéler un défaut du back.
- Le flou d'arrière-plan (verre) est retiré des captures : le texte posé
  dessus, à une position fractionnaire, basculait entre deux lissages d'un
  lancement du navigateur à l'autre (pastille active des sélecteurs de vue,
  dossier d'un projet ouvert). Mise en page, textes et couleurs restent
  comparés. Le flou, signature de l'application, garde ses propres captures
  (projet `visual-glass` : barre latérale, en-tête, une modale, le portail,
  « Dossier projet », en clair et en sombre), avec une tolérance de 1 % de
  pixels différents au lieu d'une égalité stricte.
- Avant chaque capture, le harnais attend qu'aucune requête de l'API ne soit
  en cours (le flux du chat excepté) ; au-delà de 30 s, la capture échoue en
  listant les requêtes.

- La référence utilisée pour chaque fusion est archivée
  (`npm run archive -- <PR> <base> <comparée> <journal>` dans `e2e/`) dans la
  version GitHub « captures-references », conservée 120 jours.

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
