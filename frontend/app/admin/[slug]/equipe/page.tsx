'use client';

import { Equipes } from '@/components/equipes/equipes';
import { niveauSuffisant } from '@/lib/auth';
import { useSessionCourante, useSocieteCourante, useTitrePage } from '@/lib/layout-contexte';
import type { Session } from '@/lib/types';

type Props = { params: { slug: string } };

// Équipes (maquette du boss) pour tous les rôles qui ont accès à la section
// (phase 1, 14/10/2026 : l'ancienne page par cellules est retirée ; ses
// fonctions propres — renommer, supprimer une cellule, pilote, niveau et
// photo — sont reprises dans Équipes).
export default function EquipePage({ params }: Props) {
  const session = useSessionCourante();
  const societe = useSocieteCourante();
  useTitrePage(societe?.nom ? `Équipes · ${societe.nom}` : 'Équipes');
  return <Equipes slug={params.slug} ecriture={niveauEquipeEcriture(session)} />;
}

// Module « équipe » de la matrice : écriture = admin ou rôle en écriture
// (Dir. GC…) ; les autres rôles qui y ont accès consultent seulement.
function niveauEquipeEcriture(session: Session): boolean {
  return session.role === 'societe_admin' || niveauSuffisant(session, 'equipe', 'ecriture');
}
