-- Interrupteurs de l'Administrateur HUB (29/10/2026) : modules coupés par
-- société et mode maintenance du HUB, chaque bascule tracée comme intervention.
ALTER TYPE "TypeInterventionHub" ADD VALUE 'module_desactive';
ALTER TYPE "TypeInterventionHub" ADD VALUE 'module_reactive';
ALTER TYPE "TypeInterventionHub" ADD VALUE 'maintenance_activee';
ALTER TYPE "TypeInterventionHub" ADD VALUE 'maintenance_levee';

CREATE TABLE "modules_desactives" (
    "societe_id" TEXT NOT NULL,
    "module_cle" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "par_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modules_desactives_pkey" PRIMARY KEY ("societe_id","module_cle")
);

ALTER TABLE "modules_desactives" ADD CONSTRAINT "modules_desactives_societe_id_fkey" FOREIGN KEY ("societe_id") REFERENCES "societes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "maintenance_hub" (
    "id" TEXT NOT NULL DEFAULT 'hub',
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL DEFAULT '',
    "par_id" TEXT,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_hub_pkey" PRIMARY KEY ("id")
);
