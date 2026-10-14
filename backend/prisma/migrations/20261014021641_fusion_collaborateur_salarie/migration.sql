-- Phase 1, lot 3 (14/10/2026) : le rôle socle « collaborateur » est fondu
-- dans le rôle « Salarié » de la société (décision : un seul espace salarié).
DO $$
BEGIN
  -- Garde-fou : une société sans rôle Salarié bloque la migration plutôt que
  -- de laisser des comptes sans rôle.
  IF EXISTS (
    SELECT 1 FROM "utilisateur_societe_roles" a
    JOIN "roles" r ON r."id" = a."role_id"
    WHERE r."nom" = 'collaborateur'
      AND NOT EXISTS (
        SELECT 1 FROM "roles" s
        WHERE s."nom" = 'Salarié' AND s."societe_id" = a."societe_id" AND s."supprime_le" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Compte collaborateur dans une société sans rôle Salarié';
  END IF;
END $$;

-- Sessions coupées : leur jeton porte encore le rôle collaborateur.
UPDATE "utilisateurs" SET "sessions_valides_depuis" = NOW()
WHERE "id" IN (
  SELECT a."utilisateur_id" FROM "utilisateur_societe_roles" a
  JOIN "roles" r ON r."id" = a."role_id" WHERE r."nom" = 'collaborateur'
);

-- Un compte qui aurait déjà Salarié dans la société garde cette ligne-là.
DELETE FROM "utilisateur_societe_roles" a
USING "roles" r, "roles" s
WHERE r."id" = a."role_id" AND r."nom" = 'collaborateur'
  AND s."nom" = 'Salarié' AND s."societe_id" = a."societe_id"
  AND EXISTS (
    SELECT 1 FROM "utilisateur_societe_roles" b
    WHERE b."utilisateur_id" = a."utilisateur_id" AND b."societe_id" = a."societe_id" AND b."role_id" = s."id"
  );

UPDATE "utilisateur_societe_roles" a
SET "role_id" = s."id"
FROM "roles" r, "roles" s
WHERE r."id" = a."role_id" AND r."nom" = 'collaborateur'
  AND s."nom" = 'Salarié' AND s."societe_id" = a."societe_id" AND s."supprime_le" IS NULL;

-- Le rôle socle n'ouvre plus aucun accès (cf. AuthService : rôle supprimé).
UPDATE "roles" SET "supprime_le" = NOW() WHERE "nom" = 'collaborateur' AND "societe_id" IS NULL;
