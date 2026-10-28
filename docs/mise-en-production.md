# Mise en production du HUB — Hetzner Cloud, Allemagne

Guide pas à pas pour installer la **pré-production** puis la **production**,
chacune sur son propre serveur Hetzner Cloud en Allemagne (Falkenstein ou
Nuremberg). Le domaine `exemple.sn` est un nom d'exemple : le remplacer
partout par le vrai domaine. Le dossier `deploy/` et son `README.md` décrivent
ce qui tourne sur les serveurs ; ce guide décrit ce qu'il faut créer autour.

| Élément                    | Pré-production                        | Production                                    |
| -------------------------- | ------------------------------------- | --------------------------------------------- |
| Adresse                    | `https://preprod.hub.exemple.sn`      | `https://hub.exemple.sn`                      |
| Serveur                    | CX23 : 2 vCPU, 4 Go, 40 Go            | CX33 : 4 vCPU, 8 Go, 80 Go                    |
| Données                    | démo uniquement, aucune donnée réelle | réelles                                       |
| E-mails                    | aucun envoi (`EMAIL_TRANSPORT=log`)   | service spécialisé, domaine authentifié       |
| Sauvegardes                | sur le serveur seulement              | serveur, Storage Box, copie chiffrée ailleurs |
| Option « Backups » Hetzner | non                                   | oui                                           |

## 0. Avant de commencer

- Un compte Hetzner (console.hetzner.com), l'accès au registraire du
  domaine, un compte chez un service d'envoi d'e-mails, un compte chez un
  second fournisseur de stockage (étape 7.2), un gestionnaire de mots de
  passe pour les secrets.
- Sur le Mac :
  - une clé SSH personnelle : `ssh-keygen -t ed25519 -C "hub-admin"` ;
  - `age`, pour la clé de chiffrement des sauvegardes : `brew install age`.

## 1. Serveurs (Hetzner Cloud)

Dans la console Hetzner, créer un projet « HUB », puis deux serveurs :

1. **Emplacement** : Falkenstein (`fsn1`) ou Nuremberg (`nbg1`), le même pour
   les deux serveurs. Les Storage Box (étape 7.1) sont proposées à
   Falkenstein (à confirmer à la commande) : le choisir garde tout au même
   endroit.
2. **Image** : Ubuntu 24.04.
3. **Type** (gamme « Cost-Optimized », prix à vérifier dans la console : ils
   ont évolué en 2026) :
   - pré-production : **CX23** (2 vCPU, 4 Go de mémoire, 40 Go de disque) ;
   - production : **CX33** (4 vCPU, 8 Go, 80 Go) : les images sont compilées
     sur le serveur à chaque mise à jour, et PostgreSQL garde de la marge.
4. **Réseau** : IPv4 et IPv6 publiques.
5. **Clé SSH** : ajouter la clé publique du Mac (`~/.ssh/id_ed25519.pub`).
   Aucun mot de passe n'est alors créé pour `root`.
6. **Pare-feu** : celui de l'étape 2 (on peut l'attacher après coup).
7. **Backups** (option payante, environ +20 % du prix du serveur) : **oui pour
   la production**. Hetzner garde alors 7 images complètes du serveur, une
   par jour : un filet en plus des sauvegardes de la base.
8. **Noms** : `hub-preprod`, `hub-prod`.

**Instantanés** : avant chaque mise à jour de la production, en prendre un
(console : serveur → « Snapshots » → « Take snapshot »). Il se restaure en
quelques minutes si la mise à jour tourne mal ; le supprimer une fois la
mise à jour validée (il est facturé au Go).

## 2. Pare-feu Hetzner Cloud

Console : « Firewalls » → créer `hub`, puis l'appliquer aux deux serveurs.

| Sens    | Protocole | Port | Source                            | Pourquoi                               |
| ------- | --------- | ---- | --------------------------------- | -------------------------------------- |
| Entrant | TCP       | 22   | adresse(s) IP de l'administration | SSH                                    |
| Entrant | TCP       | 80   | toutes                            | certificat HTTPS, redirection vers 443 |
| Entrant | TCP       | 443  | toutes                            | le HUB                                 |
| Entrant | ICMP      | —    | toutes                            | `ping` (facultatif)                    |

- Tout le reste est fermé en entrée ; la sortie reste ouverte (mises à jour,
  e-mails, sauvegardes).
- Si l'adresse IP de l'administration change souvent, ouvrir le port 22 à
  toutes les sources : la connexion par clé seule (étape 3) reste la
  protection.
- Ce pare-feu est en amont du serveur : il s'applique aussi aux ports publiés
  par Docker, que `ufw` ne filtre pas. La base PostgreSQL n'est publiée sur
  aucun port.

## 3. SSH par clé uniquement

Sur chaque serveur (`ssh root@<IP>`) :

```sh
cat >/etc/ssh/sshd_config.d/10-hub.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl reload ssh
```

Vérifier depuis un **second** terminal que la connexion par clé fonctionne
avant de fermer le premier. Les correctifs de sécurité d'Ubuntu s'installent
seuls (`unattended-upgrades`, actif par défaut).

## 4. Domaine et HTTPS

Chez le registraire du domaine :

| Nom                       | Type | Valeur                      |
| ------------------------- | ---- | --------------------------- |
| `hub.exemple.sn`          | A    | IPv4 de `hub-prod`          |
| `hub.exemple.sn`          | AAAA | IPv6 de `hub-prod`          |
| `preprod.hub.exemple.sn`  | A    | IPv4 de `hub-preprod`       |
| `preprod.hub.exemple.sn`  | AAAA | IPv6 de `hub-preprod`       |
| `exemple.sn` (facultatif) | CAA  | `0 issue "letsencrypt.org"` |

Attendre que les noms répondent (`dig +short hub.exemple.sn`) avant le premier
démarrage : Caddy obtient alors seul le certificat Let's Encrypt et le
renouvelle. Les ports 80 et 443 doivent être ouverts (étape 2).

## 5. Installation (sur chaque serveur)

1. Docker, puis le pare-feu local :
   ```sh
   curl -fsSL https://get.docker.com | sh
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   ```
2. Depuis le Mac : `deploy/envoyer.sh root@<IP>` copie les fichiers
   versionnés du dernier commit dans `/opt/hub` (le commit envoyé est écrit
   dans `/opt/hub/VERSION`) ; la première fois, il s'arrête faute de `.env`.
3. Sur le serveur : `cd /opt/hub/deploy && cp .env.example .env`, puis remplir
   `.env` (étape 9) et `deploy/secrets/` (étape 7.1, production).
4. `deploy/envoyer.sh root@<IP>` de nouveau : il compile et démarre le HUB.
5. **Production** : créer le compte du CIO (socle réel, sans démo) :
   ```sh
   docker compose --profile demarrage run --rm \
     -e HUB_CIO_EMAIL=prenom.nom@exemple.sn -e HUB_CIO_PRENOM=Prénom -e HUB_CIO_NOM=Nom \
     demarrage
   ```
   Ne pas le relancer ensuite : il remettrait la matrice des droits aux
   valeurs du socle. Puis ouvrir le premier dossier RH (un compte ne se crée
   qu'à partir d'un dossier, et seul le rôle RH ouvre les dossiers) :
   ```sh
   docker compose --profile demarrage run --rm --build \
     -e HUB_RH_EMAIL=prenom.nom@exemple.sn -e HUB_RH_PRENOM=Prénom -e HUB_RH_NOM=Nom \
     demarrage npx ts-node prisma/first-hr-dossier.ts
   ```
   Le CIO crée ensuite le compte RH dans le HUB ; la RH ouvre les autres
   dossiers, puis le CIO crée leurs comptes.
   **Pré-production** : charger la démo (étape 10).
6. Depuis le Mac : `deploy/verifier-deploiement.sh https://hub.exemple.sn`
   (API et base, interface, certificat, page Swagger absente, en-têtes de
   sécurité). Tout doit être coché.

## 6. Envoi d'e-mails (production)

Le HUB envoie ses e-mails (invitations, mots de passe, avis de sécurité,
devis, contrats, relances, alertes) par SMTP, via un service spécialisé dans les e-mails
transactionnels, européen de préférence (ex. Brevo, Mailjet, Postmark).

1. Créer le compte, déclarer le domaine d'envoi `exemple.sn` et l'adresse
   `no-reply@exemple.sn`.
2. Ajouter chez le registraire les enregistrements que le service indique
   (valeurs exactes données par lui) :
   - **SPF** : un enregistrement TXT sur `exemple.sn`,
     `v=spf1 include:<valeur du service> ~all`. Un domaine n'a qu'**un**
     enregistrement SPF : s'il en existe déjà un (messagerie de
     l'entreprise), y ajouter l'`include:` du service ;
   - **DKIM** : un ou deux enregistrements (TXT ou CNAME)
     `<sélecteur>._domainkey.exemple.sn` ;
   - **DMARC** : un TXT sur `_dmarc.exemple.sn`,
     `v=DMARC1; p=none; rua=mailto:dmarc@exemple.sn` (une boîte qui
     reçoit les rapports des messageries). Après deux à quatre
     semaines de rapports sans anomalie, passer à `p=quarantine`, puis à
     `p=reject`.
3. Valider le domaine dans le service, puis envoyer un e-mail de test (mot de
   passe oublié) vers une boîte Gmail : « Afficher l'original » doit indiquer
   SPF, DKIM et DMARC à `PASS`.
4. Dans `.env` : `EMAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASS` (fournis par le service), `MAIL_FROM`,
   `ALERTES_EMAIL`.

En pré-production : `EMAIL_TRANSPORT=log`. Aucun e-mail ne part (les liens
s'écrivent dans les journaux), donc aucun risque d'écrire à quelqu'un.

## 7. Sauvegardes (production)

Ce qui tourne tout seul (image `sauvegarde`, `deploy/README.md`) :

- chaque nuit à 02:30, une sauvegarde de la base, copiée sur la Storage Box
  et, chiffrée, chez un second fournisseur ;
- conservation partout : **7 quotidiennes, 4 hebdomadaires (dimanche),
  12 mensuelles** (première sauvegarde du mois) ;
- chaque dimanche à 03:30, la dernière copie de la Storage Box est restaurée
  dans une base temporaire et comparée à la base en service ;
- chaque matin à 09:00, une alerte (`ALERTES_EMAIL`) si la sauvegarde de la
  nuit manque, ou si ce test a échoué ou n'a pas tourné depuis 8 jours.

Les fichiers joints au HUB sont enregistrés dans la base : ils sont dans
chaque sauvegarde.

### 7.1 Storage Box Hetzner

1. Console : « Storage Boxes » → commander une **BX11** à Falkenstein.
2. Dans ses réglages (« Change settings ») : activer **SSH support**.
   Activer aussi les **instantanés automatiques** (ex. un par jour) : un
   instantané ne peut pas être effacé depuis le serveur, ce qui protège les
   sauvegardes même si le serveur était compromis.
3. Sur le serveur de production :
   ```sh
   mkdir -p /opt/hub/deploy/secrets && cd /opt/hub/deploy/secrets
   ssh-keygen -t ed25519 -N '' -C hub-sauvegarde -f storagebox_ed25519
   cat storagebox_ed25519.pub | ssh -p23 uXXXXX@uXXXXX.your-storagebox.de install-ssh-key
   ssh-keyscan -p 23 uXXXXX.your-storagebox.de >storagebox_known_hosts
   chmod 600 storagebox_ed25519
   ```
   (le mot de passe de la Storage Box est demandé une seule fois, pour
   installer la clé).
4. Dans `.env` : `SAUVEGARDE_BOITE_HOTE=uXXXXX.your-storagebox.de` et
   `SAUVEGARDE_BOITE_UTILISATEUR=uXXXXX`.

### 7.2 Seconde copie, chiffrée, chez un autre fournisseur

1. Chez un fournisseur de stockage compatible S3 **hors de Hetzner**, en
   Europe (ex. Scaleway à Paris, OVHcloud, Backblaze B2 en Europe) : créer un
   bucket privé (ex. `hub-sauvegardes-7f3k`) et une clé d'accès limitée à ce
   bucket. Si le fournisseur le permet, activer le versionnage ou le
   verrouillage des objets : une copie effacée reste récupérable.
2. Sur le Mac, **une seule fois**, créer la clé de chiffrement :
   ```sh
   age-keygen -o hub-sauvegardes-cle.txt
   ```
   La ligne « public key: age1… » est la **clé publique** : la mettre dans
   `SAUVEGARDE_CLE_PUBLIQUE`. Le fichier `hub-sauvegardes-cle.txt` est la
   **clé privée** : la conserver comme décrit en 7.3, **jamais sur un
   serveur**. Sans elle, la copie chiffrée est illisible, pour un voleur comme
   pour nous.
3. Dans `.env` : `SAUVEGARDE_DISTANT_FOURNISSEUR` (ex. `Scaleway`, sinon
   `Other`), `SAUVEGARDE_DISTANT_ENDPOINT`, `SAUVEGARDE_DISTANT_REGION`,
   `SAUVEGARDE_DISTANT_BUCKET`, `SAUVEGARDE_DISTANT_ACCESS_KEY`,
   `SAUVEGARDE_DISTANT_SECRET_KEY`.

### 7.3 La clé privée age

La clé privée est la seule à pouvoir ouvrir la copie chiffrée. Elle tient sur
une ligne (`AGE-SECRET-KEY-1…`).

- **Deux endroits sûrs, hors ligne et séparés** : par exemple une clé USB
  chiffrée dans le coffre de l'entreprise, et un tirage papier de la clé dans
  un second coffre (direction, banque). Jamais sur un serveur, dans un
  e-mail, une messagerie ou le dépôt de code.
- **Vérifier chaque exemplaire** au moment de le ranger : la commande
  `age-keygen -y hub-sauvegardes-cle.txt` doit afficher exactement la clé
  publique de `SAUVEGARDE_CLE_PUBLIQUE` (pour le tirage papier, la retaper
  dans un fichier puis faire de même).
- **Test de restauration avant le lancement** avec cette clé (7.5), puis
  chaque trimestre : il prouve que la clé ouvre bien les copies.
- **Clé perdue** : en créer une nouvelle (7.2, point 2) et mettre sa clé
  publique dans `.env` ; les copies suivantes l'utilisent. Les copies
  chiffrées avec l'ancienne restent illisibles (celles de la Storage Box ne
  sont pas concernées).

### 7.4 Vérifier

```sh
docker compose exec sauvegarde sauvegarde.sh            # trois copies écrites
docker compose exec sauvegarde tester-restauration.sh   # restauration identique
```

### 7.5 Tester la copie chiffrée (avant le lancement, puis chaque trimestre)

Jamais sur la pré-production (aucune donnée réelle n'y entre) : sur un
serveur temporaire (CX23, facturé à l'heure), supprimé à la fin. Avant le
lancement, la base ne contient que le socle et le compte du CIO : le test
prouve déjà que la chaîne (sauvegarde, chiffrement, clé privée) fonctionne.

1. Créer le serveur, y installer Docker et le code (étape 5, points 1 et 2),
   avec un `.env` minimal : `POSTGRES_USER`, `POSTGRES_PASSWORD` et
   `POSTGRES_DB` (valeurs quelconques) et les variables
   `SAUVEGARDE_DISTANT_*` de la production.
2. Y copier la clé privée **le temps du test** :
   `scp hub-sauvegardes-cle.txt root@<IP>:/opt/hub/deploy/secrets/`.
3. Restaurer la dernière copie chiffrée dans la base vide du serveur :
   ```sh
   docker compose up -d postgres sauvegarde
   docker compose exec sauvegarde rclone lsf distant:<bucket>/hub   # choisir la plus récente
   docker compose exec -e SAUVEGARDE_CLE_PRIVEE=/run/secrets/hub-sauvegardes-cle.txt sauvegarde \
     restaurer.sh distant:<bucket>/hub/hub-AAAAMMJJ-HHMM.dump.age --oui
   ```
   La restauration doit se terminer par « Base restaurée », et les tables
   contenir des données (`docker compose exec postgres psql -U <utilisateur> -c '\dt+'`).
4. **Supprimer le serveur** dans la console (la clé privée part avec lui).

## 8. Surveillance externe de /api/sante

Un service de surveillance externe (ex. UptimeRobot, Better Stack) interroge
le HUB depuis l'extérieur, y compris quand le serveur entier est arrêté :

- sonde HTTPS sur `https://hub.exemple.sn/api/sante`, toutes les 1 à
  5 minutes, avec le mot-clé `"statut":"ok"` (200 quand l'API et la base
  répondent, 503 sinon) ;
- alerte de l'expiration du certificat, si le service le propose ;
- alertes vers deux personnes au moins (e-mail et application ou SMS) ;
- la même sonde, moins prioritaire, pour la pré-production.

Les alertes internes (erreurs, sauvegardes) partent de leur côté vers
`ALERTES_EMAIL`.

## 9. Variables du fichier `.env`

Une copie par serveur (`deploy/.env`, jamais versionnée, jamais envoyée par
`envoyer.sh`) ; secrets générés avec `openssl rand -hex 32` (ou 48), pas en
base64 : un « / » dans le mot de passe de la base casserait `DATABASE_URL`.

| Variable                                                                  | Rôle                                                    | Production                      | Pré-production           |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------- | ------------------------ |
| `HUB_DOMAINE`                                                             | adresse publique, certificat HTTPS                      | `hub.exemple.sn`                | `preprod.hub.exemple.sn` |
| `POSTGRES_USER`                                                           | compte de la base                                       | `hub`                           | `hub`                    |
| `POSTGRES_PASSWORD`                                                       | mot de passe de la base                                 | secret propre                   | autre secret             |
| `POSTGRES_DB`                                                             | nom de la base                                          | `hub`                           | `hub`                    |
| `JWT_SECRET`                                                              | signature des sessions (32 caractères au moins)         | secret propre                   | autre secret             |
| `HUB_DOUBLE_FACTEUR`                                                      | double authentification de tous les comptes             | vide (obligatoire)              | `desactive` permis       |
| `EMAIL_TRANSPORT`                                                         | `smtp` : envoi réel ; `log` : rien n'est envoyé         | `smtp`                          | `log`                    |
| `SMTP_HOST`, `SMTP_PORT`                                                  | serveur du service d'e-mails                            | fournis par le service          | vides                    |
| `SMTP_USER`, `SMTP_PASS`                                                  | identifiants SMTP                                       | fournis par le service          | vides                    |
| `MAIL_FROM`                                                               | expéditeur des e-mails                                  | `hub360° <no-reply@exemple.sn>` | idem                     |
| `MAIL_MARQUE`                                                             | nom affiché dans les e-mails                            | `hub360°`                       | `hub360°`                |
| `ALERTES_EMAIL`                                                           | destinataire des alertes (erreurs, sauvegardes)         | adresse de l'administration     | vide (journaux seuls)    |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | réservées au futur stockage des fichiers, non utilisées | vides                           | vides                    |
| `SAUVEGARDE_BOITE_HOTE`                                                   | Storage Box (`uXXXXX.your-storagebox.de`)               | à remplir                       | vide                     |
| `SAUVEGARDE_BOITE_UTILISATEUR`                                            | identifiant de la Storage Box (`uXXXXX`)                | à remplir                       | vide                     |
| `SAUVEGARDE_DISTANT_FOURNISSEUR`                                          | type de stockage S3 pour rclone (`Scaleway`, `Other`…)  | à remplir                       | vide                     |
| `SAUVEGARDE_DISTANT_ENDPOINT`                                             | adresse du stockage du second fournisseur               | à remplir                       | vide                     |
| `SAUVEGARDE_DISTANT_REGION`                                               | région de ce stockage                                   | à remplir                       | vide                     |
| `SAUVEGARDE_DISTANT_BUCKET`                                               | bucket de la copie chiffrée                             | à remplir                       | vide                     |
| `SAUVEGARDE_DISTANT_ACCESS_KEY`, `SAUVEGARDE_DISTANT_SECRET_KEY`          | clé d'accès limitée à ce bucket                         | à remplir                       | vides                    |
| `SAUVEGARDE_CLE_PUBLIQUE`                                                 | clé publique age (`age1…`) qui chiffre la seconde copie | à remplir                       | vide                     |
| `HUB_DONNEES_DEMO`                                                        | autorise les données de démo                            | **vide**                        | `autorise`               |

Et dans `deploy/secrets/` (production) : `storagebox_ed25519` (clé SSH du
serveur vers la Storage Box) et `storagebox_known_hosts` (empreinte de la
Storage Box, contre l'usurpation).

La durée des sessions n'est pas réglable dans `.env` (décision du 28/10/2026,
`backend/src/auth/session.ts`) : 12 heures au plus depuis la connexion ; sans
activité, 1 heure pour le CEO, le CFO, le CIO et la RH, 4 heures pour les
autres. Une ancienne variable `JWT_EXPIRES_IN` est ignorée.

## 10. Pré-production sans aucune donnée personnelle réelle

- **Données** : seulement la démo, fictive :
  `docker compose --profile demo run --rm demo` (avec `HUB_DONNEES_DEMO=autorise`).
- **Jamais** d'import de données réelles : ni sauvegarde de production
  restaurée, ni copie de la base, ni fichier client, ni compte d'un vrai
  salarié. Les tests de restauration de la production se font sur un serveur
  temporaire supprimé ensuite (étape 7.5).
- **Secrets distincts** de la production (`POSTGRES_PASSWORD`,
  `JWT_SECRET`) : une session de pré-production ne vaut rien en production.
- **E-mails** : `EMAIL_TRANSPORT=log`, aucun envoi.
- **Sauvegardes** : sur le serveur seulement (pas de Storage Box ni de copie
  distante : il n'y a rien de précieux à protéger).

## 11. Chaque mise à jour

1. Instantané du serveur de production (étape 1).
2. `deploy/envoyer.sh root@<IP-pré-production>`, puis
   `deploy/verifier-deploiement.sh https://preprod.hub.exemple.sn`, puis les
   parcours principaux à la main sur la démo.
3. Même chose sur la production.
4. En cas de problème : restaurer l'instantané (console), ou renvoyer la
   version précédente ; une base abîmée se restaure depuis la dernière
   sauvegarde (`deploy/README.md`, « Restaurer »).

## 12. Récapitulatif : à faire soi-même

- [ ] Deux serveurs (CX23 pré-production, CX33 production) à Falkenstein ou Nuremberg, option « Backups » pour la production
- [ ] Pare-feu Hetzner Cloud `hub` appliqué aux deux serveurs
- [ ] SSH par clé uniquement sur les deux serveurs
- [ ] Enregistrements DNS `hub` et `preprod.hub` (A et AAAA)
- [ ] Service d'e-mails : domaine authentifié (SPF, DKIM, DMARC), identifiants SMTP
- [ ] Storage Box BX11 : SSH activé, instantanés automatiques, clé du serveur installée
- [ ] Second fournisseur : bucket privé et clé d'accès limitée
- [ ] Clé age : privée à deux endroits sûrs hors ligne, chaque exemplaire vérifié (7.3), publique dans `.env`
- [ ] `.env` des deux serveurs (étape 9) et `deploy/secrets/` en production
- [ ] Premier démarrage, compte du CIO, démo en pré-production
- [ ] `deploy/verifier-deploiement.sh` vert sur les deux adresses
- [ ] Surveillance externe de `/api/sante`
- [ ] Test de restauration de la copie chiffrée avec la clé privée (7.5), **avant le lancement**
