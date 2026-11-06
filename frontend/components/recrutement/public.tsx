import type { ReactNode } from 'react';
import Link from 'next/link';
import { CompanyAvatar } from '@/components/ui/avatar';
import type { MarqueSociete } from '@/lib/candidature-publique';

// Pages publiques du recrutement (appel à candidatures, page Carrières,
// 01/11/2026) : pages de MARQUE, à l'identité de la société (même principe
// que le lien public du devis) — bannière sombre dégradée vers
// societe.couleurMarque, corps clair, aucun habillage du HUB.
export const degradeMarque = (s: MarqueSociete) =>
  `linear-gradient(135deg, #14141a 0%, #14141a 35%, ${s.couleurMarque || '#4b4b52'} 130%)`;

export function BanniereMarque({
  societe,
  surtitre,
  children,
}: {
  societe: MarqueSociete;
  surtitre: string;
  children: ReactNode;
}) {
  return (
    <header className="rp-banniere" style={{ background: degradeMarque(societe) }}>
      <div className="rp-banniere-interieur">
        <Link href={`/carrieres/${societe.slug}`} className="rp-marque">
          <CompanyAvatar company={societe} size="lg" theme="glass" alt="" />
          <span>{societe.nom}</span>
        </Link>
        <p className="rp-surtitre">{surtitre}</p>
        {children}
      </div>
    </header>
  );
}

export function PiedMarque({ societe }: { societe: MarqueSociete }) {
  return (
    <footer className="rp-pied">
      <span>
        © {new Date().getFullYear()} {societe.nom}
      </span>
      <Link href={`/carrieres/${societe.slug}`}>Toutes nos offres</Link>
      <span className="rp-pied-hub">Recrutement propulsé par hub360°</span>
    </footer>
  );
}

export function PageIntrouvable({ titre, texte }: { titre: string; texte: string }) {
  return (
    <main className="rp-page rp-page--centre">
      <div className="rp-carte rp-introuvable">
        <h1>{titre}</h1>
        <p>{texte}</p>
      </div>
    </main>
  );
}

// Lieu, contrat, équipe, date limite : les repères d'une offre.
export function Reperes({ items }: { items: (ReactNode | null | false)[] }) {
  const visibles = items.filter(Boolean);
  if (!visibles.length) return null;
  return (
    <ul className="rp-reperes">
      {visibles.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}
