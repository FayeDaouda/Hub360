#!/bin/sh
# crond ne transmet pas l'environnement du conteneur aux tâches : on le fige
# dans un fichier que sauvegarde.sh relit.
env | grep -E '^(PG|S3_|AWS_)' | sed "s/'/'\\\\''/g; s/^\([^=]*\)=\(.*\)$/export \1='\2'/" > /etc/sauvegarde.env
exec crond -f -l 8
