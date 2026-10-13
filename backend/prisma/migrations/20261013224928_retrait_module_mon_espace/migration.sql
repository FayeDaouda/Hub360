-- Mon espace sort de la matrice (13/10/2026, phase 0) : chaque compte a le
-- sien, le serveur ne sert que le dossier du compte connecté — la ligne de
-- matrice n'était appliquée nulle part et induisait en erreur.
DELETE FROM "role_permissions"
WHERE "module_id" IN (SELECT "id" FROM "modules" WHERE "cle" = 'mon_espace');
DELETE FROM "modules" WHERE "cle" = 'mon_espace';
