# Mise en service du HUB (Hetzner)

Un serveur Hetzner, Docker, et ce dossier. Caddy obtient le certificat HTTPS
tout seul ; la base n'est jamais exposée sur internet ; une sauvegarde part
chaque nuit vers le stockage objet.

```
internet ──443──▶ caddy ──/api──▶ backend (NestJS) ──▶ postgres
                        └──────▶ frontend (Next.js)
                 sauvegarde (02:30) ──pg_dump──▶ ./sauvegardes + stockage objet
```

## Serveur de test (données fictives)

Pour essayer avant la vraie mise en service, sans acheter de domaine :

1. Créer le serveur (étapes 1 et 3 ci-dessous), puis depuis le Mac :
   `deploy/envoyer.sh root@<IP>` échoue tant que `.env` n'existe pas — le créer
   une fois sur le serveur : `ssh root@<IP>`, puis
   `cp /opt/hub/deploy/.env.example /opt/hub/deploy/.env && nano /opt/hub/deploy/.env`.
2. Dans ce `.env` : `HUB_DOMAINE=hub.<IP>.sslip.io` (adresse gratuite qui
   pointe vers l'IP, HTTPS compris) et `HUB_DONNEES_DEMO=autorise`. Ajouter
   `HUB_DOUBLE_FACTEUR=desactive` pour essayer les comptes de démo sans
   application d'authentification. Ce réglage n'est accepté qu'avec
   `HUB_DONNEES_DEMO=autorise` : sur un HUB réel, la double authentification
   de la direction et des comptes techniques ne se désactive pas.
3. `deploy/envoyer.sh root@<IP>` (envoie le code et lance le HUB), puis sur le
   serveur : `cd /opt/hub/deploy && docker compose --profile demo run --rm demo`.
4. Le HUB de test répond sur `https://hub.<IP>.sslip.io`, comptes de démo et
   mot de passe `changeme123`. Supprimer le serveur dans la console Hetzner à
   la fin du test (facturation à l'heure).

## Première installation

1. **Serveur** : Hetzner Cloud en Allemagne, Ubuntu 24.04, CX33 (4 vCPU,
   8 Go) pour la production ; pare-feu, clé SSH, instantanés, e-mails,
   sauvegardes et surveillance : `docs/mise-en-production.md`.
2. **Domaine** : chez le registraire, un enregistrement `A` du domaine choisi
   (ex. `hub.greyconcrete.sn`) vers l'IP du serveur. Attendre qu'il réponde
   (`ping hub.greyconcrete.sn`) avant l'étape 5, sinon le certificat échoue.
3. **Docker** sur le serveur :
   ```sh
   curl -fsSL https://get.docker.com | sh
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   ```
4. **Code et configuration** : depuis le Mac, `deploy/envoyer.sh root@<IP>`
   copie les fichiers versionnés du dernier commit dans `/opt/hub` (jamais un
   fichier non suivi ni une modification non commitée ; il s'arrête la
   première fois faute de `.env`). Puis sur le serveur :
   ```sh
   cd /opt/hub/deploy && cp .env.example .env && nano .env   # domaine, mots de passe, secrets
   ```
   Générer les secrets : `openssl rand -hex 32` (base), `openssl rand -hex 48` (JWT).
   Pas de base64 : un « / » dans le mot de passe de la base casserait
   l'adresse de connexion (`DATABASE_URL`).
5. **Lancement** :
   ```sh
   docker compose --env-file .env up -d --build
   docker compose logs -f backend      # migrations puis « HUB API démarrée »
   ```
   Le HUB répond sur `https://<domaine>`.
6. **Premier compte** : la base est vide. Le script de démarrage installe le
   socle réel (rôles, matrice des droits, société, catalogue) et crée le compte
   du CIO, sans aucune donnée de démo :
   ```sh
   docker compose --profile demarrage run --rm \
     -e HUB_CIO_EMAIL=prenom.nom@greyconcrete.sn -e HUB_CIO_PRENOM=Prénom -e HUB_CIO_NOM=Nom \
     demarrage
   ```
   Il affiche une seule fois un mot de passe provisoire : le CIO se connecte
   avec, puis le change (menu du compte). Ne pas le relancer une fois le HUB
   en service : il remettrait la matrice des droits aux valeurs du socle. Ne
   jamais lancer `prisma db seed` ici : les scripts de démo sont refusés en
   production.
7. **Premier dossier RH** : un compte ne se crée qu'à partir d'un dossier RH,
   et seul le rôle RH ouvre les dossiers. Celui de la personne RH s'ouvre donc
   ici, avec son identité seule (refusé dès qu'un compte RH existe) :
   ```sh
   docker compose --profile demarrage run --rm --build \
     -e HUB_RH_EMAIL=prenom.nom@greyconcrete.sn -e HUB_RH_PRENOM=Prénom -e HUB_RH_NOM=Nom \
     demarrage npx ts-node prisma/first-hr-dossier.ts
   ```
   Le CIO crée ensuite son compte (Nouveau compte, rôle RH) ; la RH ouvre les
   dossiers des autres, puis le CIO crée leurs comptes.

## Pré-production

Même dossier, sur un second serveur (CX23 : 2 vCPU, 4 Go), avec
son propre `.env` : un autre domaine (ex. `preprod.hub.greyconcrete.sn`),
d'autres secrets, `ALERTES_EMAIL` renseignée, et `HUB_DONNEES_DEMO=autorise`
si l'on veut y charger la démo (`docker compose --profile demo run --rm demo`).
Chaque mise à jour passe par la pré-production avant la production :

1. `deploy/envoyer.sh root@<IP-de-la-pré-production>` ;
2. `deploy/verifier-deploiement.sh https://preprod.hub.greyconcrete.sn`
   (API et base, interface, certificat, page Swagger absente, en-têtes de
   sécurité) ;
3. les parcours à vérifier à la main sur la démo, puis la même chose en
   production.

La CI démarre déjà la même pile (`docker compose`, domaine `localhost`) et
lui applique ce contrôle à chaque envoi.

## Mettre à jour

Avant chaque envoi, sur le Mac : `cd backend && npm test && npm run test:e2e`
(tests unitaires, puis les trois parcours critiques sur une base de test
créée et supprimée à chaque lancement : connexion et droits, offre → facture
payée, remise → validation d'une tâche). Tout doit être vert.

Depuis le Mac : `deploy/envoyer.sh root@<IP>`, puis
`deploy/verifier-deploiement.sh https://<domaine>`. Les migrations de base
s'appliquent au démarrage du backend ; l'interface attend que l'API réponde
(contrôle de santé `/api/sante`).

## Suivi des erreurs et surveillance

- **Erreurs** : chaque erreur de l'API (réponse 5xx), du serveur (tâche
  planifiée, envoi d'e-mail…) ou du navigateur d'un utilisateur connecté est
  écrite sur une ligne JSON dans les journaux :
  ```sh
  docker compose logs backend | grep '"suivi":"erreur"'
  ```
- **Alertes** : avec `ALERTES_EMAIL` (et l'envoi d'e-mails configuré), un
  e-mail résume les erreurs, au plus un par quart d'heure : la première part
  tout de suite, les suivantes sont regroupées.
- **Sauvegardes** : chaque dimanche à 03:30, une sauvegarde fraîche est
  restaurée dans une base temporaire et comparée à la base en service
  (`tester-restauration.sh`, résultat dans
  `sauvegardes/derniere-verification.txt`). Chaque matin à 09:00, l'API
  alerte si la sauvegarde de la nuit manque, ou si ce test a échoué ou n'a
  pas tourné depuis 8 jours. À la main :
  `docker compose exec sauvegarde tester-restauration.sh`.
- **Disponibilité** : `https://<domaine>/api/sante` répond 200 quand l'API et
  la base répondent, 503 sinon. Une sonde externe (service de surveillance
  au choix) peut l'interroger toutes les quelques minutes.

## Sauvegardes

- Automatique chaque nuit à 02:30 : `deploy/sauvegardes/hub-AAAAMMJJ-HHMM.dump`,
  copie sur la Storage Box Hetzner et seconde copie chiffrée (age) chez un
  autre fournisseur, si configurées. Conservation partout : 7 quotidiennes,
  4 hebdomadaires (dimanche), 12 mensuelles. Mise en place :
  `docs/mise-en-production.md`.
- À la demande : `docker compose exec sauvegarde sauvegarde.sh`
- **Restaurer** (remplace les données actuelles) :
  ```sh
  docker compose stop backend
  docker compose exec sauvegarde restaurer.sh /sauvegardes/hub-AAAAMMJJ-HHMM.dump --oui
  docker compose start backend
  ```
  Une copie de la Storage Box se restaure de la même façon avec son adresse
  `boite:hub/hub-….dump` ; la copie chiffrée avec
  `distant:<bucket>/hub/hub-….dump.age`, en apportant la clé privée age
  (`-e SAUVEGARDE_CLE_PRIVEE=…`, `docs/mise-en-production.md`).
- **Vérifier une restauration** : restaurer dans une base neuve, puis
  comparer les deux bases table par table (nombre de lignes, empreinte du
  contenu, séquences) :
  ```sh
  docker compose exec sauvegarde psql -c 'CREATE DATABASE hub_verification'
  docker compose exec -e PGDATABASE=hub_verification sauvegarde \
    restaurer.sh /sauvegardes/hub-AAAAMMJJ-HHMM.dump --oui
  docker compose exec sauvegarde verifier-restauration.sh hub hub_verification
  docker compose exec sauvegarde psql -c 'DROP DATABASE hub_verification'
  ```
  Sur une base en service, des écarts peuvent venir de l'activité depuis la
  sauvegarde : comparer de préférence juste après une sauvegarde manuelle.
- La CI le fait à chaque envoi sur les données de démo (job « Sauvegarde et
  restauration ») avec les scripts réels de l'image. Tester aussi une
  restauration sur la pré-production au moins une fois par trimestre : une
  sauvegarde jamais restaurée n'est pas une sauvegarde.
