# Sauvegarde PostgreSQL planifiée (crond) + envoi vers le stockage objet.
FROM postgres:16-alpine
RUN apk add --no-cache aws-cli
COPY sauvegarde.sh restaurer.sh demarrer-sauvegarde.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh && echo '30 2 * * * /usr/local/bin/sauvegarde.sh >> /proc/1/fd/1 2>&1' > /etc/crontabs/root
CMD ["demarrer-sauvegarde.sh"]
