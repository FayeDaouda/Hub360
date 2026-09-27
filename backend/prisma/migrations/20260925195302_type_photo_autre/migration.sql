-- Ajoute « autre » à TypePhotoImage : catch-all pour les images jointes
-- depuis des checklists qui ne sont pas des photos du bâtiment (Permis,
-- Avant-projet) — cf. schema.prisma.
ALTER TYPE "TypePhotoImage" ADD VALUE 'autre';
