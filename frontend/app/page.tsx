import { getSocietes } from '@/lib/api';
import { SocieteGrid } from '@/components/societe-grid';

// Page portail : affiche toutes les sociétés actives de la holding.
// Un clic redirige vers /login/[slug], qui demande email/mdp.
export default async function PortailPage() {
  const societes = await getSocietes();

  return (
    <main className="portal">
      <div className="portal-inner">
        <header className="portal-header">
          <img
            src="/logos/hub-icon-2.png"
            alt="hub360°"
            className="portal-logo"
            width={152}
            height={80}
          />
          <h1 className="portal-title">Bienvenue sur hub360°</h1>
          <p className="portal-tagline">Choisis ta société pour accéder à ton espace</p>
        </header>

        {societes.length === 0 ? (
          <p className="empty-state">Aucune société active pour le moment.</p>
        ) : (
          <SocieteGrid societes={societes} />
        )}
      </div>
    </main>
  );
}
