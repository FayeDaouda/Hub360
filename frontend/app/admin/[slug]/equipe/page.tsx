'use client';
import { use } from 'react';

import { Teams } from '@/features/teams/teams';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante, useSocieteCourante, useTitrePage } from '@/lib/layout-contexte';
import type { Session } from '@/lib/types';
import { ETAPE } from '@hub/domain';

type Props = { params: Promise<{ slug: string }> };

// Équipes (maquette du boss) pour tous les rôles qui ont accès à la section
// (phase 1, 14/10/2026 : l'ancienne page par cellules est retirée ; ses
// fonctions propres — renommer, supprimer une cellule, pilote, niveau et
// photo — sont reprises dans Équipes).
export default function EquipePage(props: Props) {
  const params = use(props.params);
  const session = useSessionCourante();
  const societe = useSocieteCourante();
  useTitrePage(societe?.nom ? `Équipes · ${societe.nom}` : 'Équipes');
  return (
    <Teams
      slug={params.slug}
      canWrite={niveauEquipeEcriture(session)}
      canDelete={niveauSuffisant(session, ETAPE.equipe, 'suppression')}
    />
  );
}

// Étape « Équipes et collaborateurs » de la matrice : l'Écriture modifie,
// la Suppression supprime une équipe ; sans elles, on consulte.
function niveauEquipeEcriture(session: Session): boolean {
  return niveauSuffisant(session, ETAPE.equipe, 'ecriture');
}
