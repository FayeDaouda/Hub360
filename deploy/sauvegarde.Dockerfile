# Sauvegarde PostgreSQL planifiée (crond), copies sur la Storage Box et
# chiffrée chez un second fournisseur (rclone, age).
FROM postgres:16-alpine
RUN apk add --no-cache rclone age
COPY sauvegarde.sh restaurer.sh rotation-sauvegardes.sh verifier-restauration.sh tester-restauration.sh demarrer-sauvegarde.sh /usr/local/bin/
# Chaque nuit à 02:30 une sauvegarde ; le dimanche à 03:30, une sauvegarde
# fraîche puis son test de restauration (tester-restauration.sh).
RUN chmod +x /usr/local/bin/*.sh && printf '%s\n' \
    '30 2 * * * /usr/local/bin/sauvegarde.sh >> /proc/1/fd/1 2>&1' \
    '30 3 * * 0 (/usr/local/bin/sauvegarde.sh && /usr/local/bin/tester-restauration.sh) >> /proc/1/fd/1 2>&1' \
    > /etc/crontabs/root
CMD ["demarrer-sauvegarde.sh"]
