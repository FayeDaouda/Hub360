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
   pointe vers l'IP, HTTPS compris) et `HUB_DONNEES_DEMO=autorise`.
3. `deploy/envoyer.sh root@<IP>` (envoie le code et lance le HUB), puis sur le
   serveur : `cd /opt/hub/deploy && docker compose --profile demo run --rm demo`.
4. Le HUB de test répond sur `https://hub.<IP>.sslip.io`, comptes de démo et
   mot de passe `changeme123`. Supprimer le serveur dans la console Hetzner à
   la fin du test (facturation à l'heure).

## Première installation

1. **Serveur** : Hetzner Cloud, Ubuntu 24.04, 2 vCPU / 4 Go (CX23, ex-CX22) suffisent
   au départ. Ajouter sa clé SSH à la création.
2. **Domaine** : chez le registraire, un enregistrement `A` du domaine choisi
   (ex. `hub.greyconcrete.sn`) vers l'IP du serveur. Attendre qu'il réponde
   (`ping hub.greyconcrete.sn`) avant l'étape 5, sinon le certificat échoue.
3. **Docker** sur le serveur :
   ```sh
   curl -fsSL https://get.docker.com | sh
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   ```
4. **Code et configuration** : depuis le Mac, `deploy/envoyer.sh root@<IP>`
   copie le code dans `/opt/hub` (il s'arrête la première fois faute de
   `.env`). Puis sur le serveur :
   ```sh
   cd /opt/hub/deploy && cp .env.example .env && nano .env   # domaine, mots de passe, secrets
   ```
   Générer les secrets : `openssl rand -base64 32` (base), `openssl rand -base64 48` (JWT).
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
   avec, puis le change (menu du compte). Rejouable sans risque. Ne jamais
   lancer `prisma db seed` ici : les scripts de démo sont refusés en production.

## Pré-production

Même dossier, sur un second petit serveur (CX11, ~4 €/mois), avec son propre
`.env` : un autre domaine (ex. `preprod.hub.greyconcrete.sn`), d'autres
secrets, et `HUB_DONNEES_DEMO=autorise` si l'on veut y charger la démo
(`docker compose --profile demo run --rm demo`). Chaque mise à jour passe par la pré-production avant la
production.

## Mettre à jour

Depuis le Mac : `deploy/envoyer.sh root@<IP>`.
Les migrations de base s'appliquent au démarrage du backend.

## Sauvegardes

- Automatique chaque nuit à 02:30 : `deploy/sauvegardes/hub-AAAAMMJJ-HHMM.dump`
  (14 gardées) et copie dans `S3_BUCKET_SAUVEGARDES` si le stockage objet est
  configuré.
- À la demande : `docker compose exec sauvegarde sauvegarde.sh`
- **Restaurer** (remplace les données actuelles) :
  ```sh
  docker compose stop backend
  docker compose exec sauvegarde restaurer.sh /sauvegardes/hub-AAAAMMJJ-HHMM.dump --oui
  docker compose start backend
  ```
  Une copie distante se restaure de la même façon avec son adresse `s3://…`.
- Tester une restauration sur la pré-production au moins une fois par
  trimestre : une sauvegarde jamais restaurée n'est pas une sauvegarde.
