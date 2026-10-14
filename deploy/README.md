# Mise en service du HUB (Hetzner)

Un serveur Hetzner, Docker, et ce dossier. Caddy obtient le certificat HTTPS
tout seul ; la base n'est jamais exposée sur internet ; une sauvegarde part
chaque nuit vers le stockage objet.

```
internet ──443──▶ caddy ──/api──▶ backend (NestJS) ──▶ postgres
                        └──────▶ frontend (Next.js)
                 sauvegarde (02:30) ──pg_dump──▶ ./sauvegardes + stockage objet
```

## Première installation

1. **Serveur** : Hetzner Cloud, Ubuntu 24.04, 2 vCPU / 4 Go (CX22) suffisent
   au départ. Ajouter sa clé SSH à la création.
2. **Domaine** : chez le registraire, un enregistrement `A` du domaine choisi
   (ex. `hub.greyconcrete.sn`) vers l'IP du serveur. Attendre qu'il réponde
   (`ping hub.greyconcrete.sn`) avant l'étape 5, sinon le certificat échoue.
3. **Docker** sur le serveur :
   ```sh
   curl -fsSL https://get.docker.com | sh
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   ```
4. **Code et configuration** :
   ```sh
   git clone <dépôt> /opt/hub && cd /opt/hub/deploy
   cp .env.example .env && nano .env    # domaine, mots de passe, secrets
   ```
   Générer les secrets : `openssl rand -base64 32` (base), `openssl rand -base64 48` (JWT).
5. **Lancement** :
   ```sh
   docker compose --env-file .env up -d --build
   docker compose logs -f backend      # migrations puis « HUB API démarrée »
   ```
   Le HUB répond sur `https://<domaine>`.
6. **Premier compte** : la base est vide. Créer le compte du CIO et la société
   avec le script d'amorçage (à fournir avec la reprise des vraies données,
   phase 3). Ne jamais lancer `prisma db seed` ici : les scripts de démo sont
   refusés en production.

## Pré-production

Même dossier, sur un second petit serveur (CX11, ~4 €/mois), avec son propre
`.env` : un autre domaine (ex. `preprod.hub.greyconcrete.sn`), d'autres
secrets, et `HUB_DONNEES_DEMO=autorise` si l'on veut y charger la démo
(`docker compose exec backend npx ts-node prisma/seed.ts` n'est pas inclus
dans l'image : charger la démo depuis un poste de développement pointé sur
cette base). Chaque mise à jour passe par la pré-production avant la
production.

## Mettre à jour

```sh
cd /opt/hub && git pull
cd deploy && docker compose --env-file .env up -d --build
```
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
