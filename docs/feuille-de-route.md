# Feuille de route du chantier « nettoyage et structuration »

Document vivant : état des phases, suites décidées, propositions en attente de
décision. Rapport d'audit initial : `docs/audit/2026-10-24-audit-initial.md`.
Décisions structurantes : `docs/adr/`.

## Phases

| Phase                 | Contenu                                                                                                                                                                                                                                 | État                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Filet de sécurité | environnement de référence, 232 captures, tests de fumée                                                                                                                                                                                | fait (PR #1)                                                                                                                                                                                                                                                           |
| 1 — Audit             | rapport chiffré, plan                                                                                                                                                                                                                   | fait (PR #1)                                                                                                                                                                                                                                                           |
| 2 — Sécurité          | dépendances (0 vulnérabilité), isolation entre sociétés (ADR 0001), fichiers par usage, configuration validée, en-têtes et CSP à nonce, ordre du journal d'audit (ADR 0002)                                                             | fait (PR #2)                                                                                                                                                                                                                                                           |
| Formatage             | Prettier sur tout le dépôt, en un commit ignoré par `git blame`                                                                                                                                                                         | fait (PR #3)                                                                                                                                                                                                                                                           |
| S0 — Fondations       | S0a fonctions utilitaires, S0b composants d'interface, S0c client d'API généré (OpenAPI) : trois PR séparées                                                                                                                            | S0a (#7), S0b (#12, #14), S0c faits                                                                                                                                                                                                                                    |
| Exploitation          | préproduction, sauvegardes automatiques avec restauration testée, suivi des erreurs en production                                                                                                                                       | faite (PR #21, #22), serveurs à créer                                                                                                                                                                                                                                  |
| Structuration         | module par module, du plus petit au plus gros : S1 Équipes, S2 Mes tâches et Mon espace, S3 Projets, S4 Finances, devis et contrats, S5 CRM, S6 RH, S7 Pilotage, Réglages, Groupe et chat ; peut se poursuivre l'application en service | S1, S2 et S3 faites (S3 Projets : back dans `src/projects`, réponses décrites par des DTO, front dans `features/projects`, règles du nom de fichier déposé, du retard d'une reprise et de la livraison proche fournies par le back) ; S4 à S7 après la mise en service |
| Refonte visuelle      | indigo, Geist, tuile neutre, verre réservé au chrome : on change les valeurs des tokens, puis on valide les nouvelles captures comme nouvelle référence                                                                                 | après la structuration, en lots séparés                                                                                                                                                                                                                                |
| Documentation         | `README.md`, `ARCHITECTURE.md`, `docs/glossaire.md`, `CLAUDE.md`                                                                                                                                                                        | glossaire commencé                                                                                                                                                                                                                                                     |

## Règles de la structuration

- **Rendu identique au pixel près.** La structuration ne change rien à
  l'écran : les composants sont construits sur les tokens avec les valeurs
  actuelles. Une capture qui change est une régression à corriger. La refonte
  visuelle vient ensuite, en lots séparés : elle modifie les valeurs des tokens
  (un seul fichier) et valide une nouvelle référence de captures.
- **Critères de fin de chaque module :**
  - le module est dans `features/`, avec ses noms en anglais ;
  - aucun fichier de code (TS, TSX) de plus de 300 lignes, aucune copie de
    fonction utilitaire. Exception : les feuilles CSS, découpées avec la
    refonte visuelle (les découper avant change l'ordre de la cascade, donc
    le rendu ; décision du 28/10/2026) ;
  - les règles métier du module sont calculées au back et testées ;
  - chaque écran gère le chargement, le vide et l'erreur ;
  - des tests côté front sur les composants et les hooks principaux ;
  - ses réponses d'API décrites par des DTO, et ses appels typés par les
    types générés (`frontend/lib/api/types.ts`, ADR 0005) ;
  - les chiffres avant et après dans la description de la PR.
- **Noms des modèles de données** : ils restent en français pendant la
  structuration des modules ; renommés en anglais à la fin, en une seule PR,
  avec `@map`/`@@map` et sans migration (décision du 28/10/2026).
- **Routes et champs de l'API inchangés** pendant la structuration (contrat
  public) ; vérifié par `npm run validate` (forme des réponses, ci-dessous).
  Avant de sortir les applications macOS, Windows et iOS, introduire un
  préfixe de version (`/api/v1`) : une fois des applications installées, on
  ne peut plus changer une route sans casser les anciennes versions.
- **Types partagés** (S0c) : OpenAPI généré depuis le back, client typé pour
  le front ; `packages/domain` limité aux schémas de formulaires, au formatage
  et aux constantes, les règles métier restant calculées au back.
  **Critère de fin de S0c** : les fonctions de dates, de montants et de texte
  n'existent plus qu'en une version, dans le paquet partagé ; les copies de
  `frontend/lib/` (`dates.ts`, `format.ts`, `text.ts`) et de
  `backend/src/shared/` sont supprimées. Fait : paquet `@hub/domain`
  (`packages/domain`, ADR 0004). Client d'API : description OpenAPI générée
  depuis le code et types du front générés, vérifiés par la CI (ADR 0005).

## Suites décidées, pas encore faites

- **Montants saisis** : refuser les décimales avec un message clair dès la
  saisie, sauf pour les pourcentages (décision n° 4).
- **Turbopack** : corriger les écarts CSS qu'il produit (58 écrans), puis
  abandonner `--webpack`.
- **NestJS 12** : publié en ESM uniquement ; migrer d'abord le back et Jest en
  ESM.
- **Règles React Compiler** : 53 avertissements, corrigés module par module
  pendant la structuration, puis remis en erreur (46 après S2).
- **Saisie des dates dans Réglages** (S7) : `components/reglages/valeurs-panel.tsx`
  accepte une date impossible (31/02/2026). L'analyseur strict de Mon espace
  (`parseDayInput`, `features/my-space/request-parts.tsx`) pourrait la
  remplacer : changement de comportement, à décider avec S7.
- **Tournée des rappels** : la découper par société (aujourd'hui en périmètre
  système, ADR 0001).
- **Noms des rôles** : `'CEO (transverse)'` est écrit dans 18 fichiers du back
  (Finances, CRM, RH, Pilotage, Rôles, rappels…), `'Salarié'` dans 3.
  Regrouper les noms de rôles dans un seul fichier de constantes, partagé par
  tous les modules : étape à part, puisqu'elle touche tous les modules (sans
  changement de comportement).
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
  pas d'import dynamique. Non reproduite en 20 passages d'une sonde rejouant
  l'ancienne attente (26/10/2026) : cause non établie, l'attente robuste des
  captures est gardée telle quelle (décision du 26/10/2026).
- **Images sans dimensions** (défaut d'interface) : signature du contrat
  (`.contrat-signature`) et logo du document de facture (`.fd-logo`), dont la
  hauteur dépend de l'image chargée ; à corriger, avec captures avant/après.
- **Avatar des cellules (Équipes)** : `eq-avatar` de
  `features/teams/cell-card.tsx` est un contrôle d'envoi de photo (label,
  image de fond), distinct de `PersonAvatar`, et ses initiales ne sont pas
  mises en majuscules (`initialesDe` le fait) ; l'unifier change le rendu :
  avec la refonte visuelle (S1 garde le rendu au pixel).
- **Lot de microcopie** : remplacer les « (s) » par de vrais accords selon le
  nombre (« 1 facture émise », « 3 factures émises »), avec `plural` de `@hub/domain`.
  Changement de texte visible : lot à part, après la structuration.

## Exploitation : ce qui est en place, ce qui reste

- **En place** : Node 24 LTS partout (#19) ; images Docker construites et
  pile de production démarrée en CI, avec contrôle après déploiement
  (`deploy/verifier-deploiement.sh`) ; restauration des sauvegardes testée en
  CI (#21) et chaque semaine sur les vraies données, surveillée chaque matin ;
  suivi des erreurs sans service extérieur, alertes par e-mail (ADR 0006) ;
  état de santé `/api/sante`.
- **Sauvegardes hors du serveur** (demande du 27/10/2026) : Storage Box
  Hetzner, plus une seconde copie chiffrée (age, clé privée hors du serveur)
  chez un autre fournisseur ; conservation 7 quotidiennes, 4 hebdomadaires,
  12 mensuelles, sur le serveur et sur chaque copie ; le test hebdomadaire
  restaure la copie de la Storage Box. Outils de l'image de sauvegarde :
  `rclone` et `age` (paquets Alpine) à la place d'`aws-cli` — **nouvelle
  dépendance, en attente de l'accord du user** avant fusion.
- **Guide de mise en production** : `docs/mise-en-production.md` (serveurs,
  pare-feu, SSH, domaine, e-mails SPF/DKIM/DMARC, sauvegardes, surveillance
  externe, variables `.env`, pré-production sans donnée réelle).
- **À faire par le user** (accès qu'il détient) : tout le récapitulatif du
  guide (serveurs, domaine, service d'e-mails, Storage Box, second
  fournisseur, clé age, `.env`, surveillance externe de `/api/sante`).
- **Plus tard, sur décision** : service de suivi des erreurs spécialisé
  (Sentry ou GlitchTip : dépendance et sous-traitant de données).

## Prêt pour le lancement (état des lieux et décisions du 28/10/2026)

Déjà en place : réinitialisation du mot de passe par e-mail (lien d'une
heure, sessions coupées), double authentification (hors Salarié jusqu'au
lot A), création des comptes par invitation (lien de 72 h). Lots décidés :

- **A** (fait, PR #27) : e-mail d'avis quand le mot de passe ou la double
  authentification change ; double authentification obligatoire pour
  **tous** les rôles. Reste : essai des e-mails réels en pré-production.
- **B** (fait) : session de 12 h au plus partout ; expiration après 1 h
  d'inactivité pour CEO, CFO, CIO et RH, 4 h pour les autres
  (`backend/src/auth/session.ts`), prolongée par l'activité dans le HUB ;
  retour à l'écran de connexion à l'échéance. À confirmer : les comptes de
  secours (`holding_admin`, `societe_admin`) ont 4 h, comme « les autres ».
  Cookie `httpOnly` juste après le lancement.
- **C** (fait) : verrouillage d'un compte après 10 échecs (mot de passe ou
  code de double authentification), 15 min, durée doublée à chaque récidive
  et plafonnée à 1 h ; déblocage par le CIO (Comptes & rôles) ; avis par
  e-mail et journal (`backend/src/auth/verrouillage.ts`). Choix à confirmer :
  l'écran de connexion dit que le compte est verrouillé, avec l'heure de fin
  (il révèle donc qu'un compte existe, après 10 essais ; sinon, message
  habituel et e-mail seul) ; les récidives se comptent depuis la dernière
  connexion réussie ; un mot de passe réinitialisé par lien ne débloque pas.
- **D** (attend les exports du user) : import des clients actifs, projets en
  cours, salariés présents et factures non soldées ; pièces jointes des
  factures non soldées et des contrats en cours seulement ; numéros de
  facture d'origine conservés, la suite du HUB après le dernier émis (à
  valider par le CFO et le comptable) ; fichiers fournis et validés par la RH
  (salariés), le CFO (factures) et le COO (clients, projets) ; à blanc, puis
  réel.

## En attente d'une décision extérieure

- **Périmètre RH** (direction) : commun aux quatre sociétés ou propre à
  chacune ; puis permission explicite « vue groupe » en lecture, avec journal
  des accès (ADR 0001).
- **Liens publics** (direction) : devis valable jusqu'à sa date de validité,
  contrat actif jusqu'à la signature puis lecture seule limitée, révocation et
  régénération.
- **Formats BIM** (équipe) : Revit, ArchiCAD, SketchUp pour les livrables.
- **Contrat signé imprimable** (décision métier du 27/10/2026, hors S0b) : la
  version imprimée et le PDF du contrat incluent la signature, le nom du
  signataire, la date et l'heure de signature (heure de Dakar) et une
  référence unique du document signé. Aujourd'hui, aucune version imprimable
  n'existe et la signature tracée ne s'affiche qu'à l'écran, dans le dossier
  CRM. Les modalités sont proposées à la direction (document « Contrat signé :
  version imprimée et PDF ») : format de la référence (recommandé :
  `AB_YOF.26-CT1`, comme les offres), exemplaire du client, page de preuve
  avec empreinte numérique, date des contrats papier, signature de la société.

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
- Les sessions des captures sont ouvertes au démarrage de l'environnement :
  depuis le lot B, celles du CEO, du CFO et du CIO valent 1 h. La série
  complète et les tests de fumée doivent tenir dans l'heure (environ
  4 minutes aujourd'hui).

- La référence utilisée pour chaque fusion est archivée
  (`npm run archive -- <PR> <base> <comparée> <journal>` dans `e2e/`) dans la
  version GitHub « captures-references », conservée 120 jours.

- **Outillage** (e2e/) : `npm run validate -- <branche>` = la validation d'une
  fusion (série complète contre la référence de `main`, puis tests de fumée) ;
  la branche est compilée pendant la capture de la référence, elle-même
  reprise seulement si `main`, le jour ou le harnais ont changé. Compilations
  en cache (10 dernières), 4 environnements identiques (bases clonées par
  `CREATE DATABASE … TEMPLATE`, écrans répartis par clé stable). Pendant le
  travail : `npm run visual:quick -- <filtre>` (jamais pour une fusion).
  Mesuré : série 4,8 à 5 min (contre 6 à 10), environnement en cache 40 s
  (contre ~7 min) ; 8 environnements saturent la machine.
- **Forme des réponses de l'API** : pendant les captures, chaque réponse JSON
  réussie laisse ses clés et leurs types, par route ; `validate` compare le
  relevé de la branche à celui de `main` et échoue si une clé disparaît ou
  change de type (`scripts/api-shapes.mjs`). Couverture : les routes appelées
  par les écrans capturés (les écritures et les écrans non capturés n'y sont
  pas).
- **Rien de lourd en même temps qu'une validation** (envoi avec son crochet
  `pre-push`, compilation) : le 27/10/2026, un test de fumée a échoué ainsi.
  Un test qui crée quelque chose attend la réponse avant de quitter la page,
  sinon la navigation interrompt la requête sur une machine chargée. À froid
  (premier passage dans un dossier neuf), la compilation de la branche en
  parallèle de la référence peut faire couper des connexions à l'API
  (`ECONNRESET`, constaté une fois le 27/10/2026) : relancer à chaud. Autre
  signature vue une fois (PR #30, premier écran capturé d'un environnement) :
  « SyntaxError: Unexpected end of JSON input » en moins d'une seconde, l'API
  de l'environnement muette ensuite ; source non trouvée, relancer à chaud.

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
