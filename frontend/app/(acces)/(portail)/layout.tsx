import type { ReactNode } from 'react';
import { ContenuAcces } from '@/components/auth/acces';

// En-tête du portail dans le layout : il reste en place quand la grille passe
// du squelette (loading.tsx) aux vraies sociétés. Le groupe (portail) borne
// aussi ce loading.tsx à la seule page d'accueil — à la racine de app/, il
// servait de chargement à TOUTES les routes (squelette du portail affiché
// pendant l'arrivée sur /admin après connexion).
export default function PortailLayout({ children }: { children: ReactNode }) {
  return (
    <ContenuAcces logoVersPortail={false} className="portail">
      <header className="portail-entete">
        <h1 className="portail-titre">
          Bienvenue sur <span className="portail-titre-marque">hub360°</span>
        </h1>
        <p className="portail-sous-titre">
          Choisissez votre société pour accéder à votre espace.
        </p>
      </header>
      {children}
    </ContenuAcces>
  );
}
