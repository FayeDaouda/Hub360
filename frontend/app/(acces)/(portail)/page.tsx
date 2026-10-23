import { Building2 } from 'lucide-react';
import { getSocietes } from '@/lib/api';
import { SocieteGrid } from '@/components/societe-grid';

// Page portail : affiche toutes les sociétés actives de la holding.
// Un clic redirige vers /login/[slug], qui demande email/mdp.
export default async function PortailPage() {
  const societes = await getSocietes();

  if (societes.length === 0) {
    return (
      <p className="portail-vide">
        <Building2 size={18} aria-hidden />
        Aucune société active pour le moment.
      </p>
    );
  }
  return <SocieteGrid societes={societes} />;
}
