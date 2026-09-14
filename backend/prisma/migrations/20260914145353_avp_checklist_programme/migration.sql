-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CleChecklistAvp" ADD VALUE 'prog_sous_sol';
ALTER TYPE "CleChecklistAvp" ADD VALUE 'prog_rdc';
ALTER TYPE "CleChecklistAvp" ADD VALUE 'prog_etage_courant';
ALTER TYPE "CleChecklistAvp" ADD VALUE 'prog_terrasse';
ALTER TYPE "CleChecklistAvp" ADD VALUE 'prog_standing';
ALTER TYPE "CleChecklistAvp" ADD VALUE 'prog_gamme';
ALTER TYPE "CleChecklistAvp" ADD VALUE 'prog_style';
ALTER TYPE "CleChecklistAvp" ADD VALUE 'prog_autres_infos';

-- AlterEnum
ALTER TYPE "GroupeChecklistAvp" ADD VALUE 'programme';
