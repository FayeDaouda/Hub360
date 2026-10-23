import {
  Briefcase,
  Building2,
  Code,
  Factory,
  Landmark,
  Network,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

// Liste blanche volontairement restreinte : une nouvelle société choisit une
// de ces clés en base (colonne `icone`) — ajouter une icône ici suffit à la
// rendre disponible à toute société, sans logique par société codée en dur.
const ICONS: Record<string, LucideIcon> = {
  code: Code,
  'building-2': Building2,
  network: Network,
  briefcase: Briefcase,
  factory: Factory,
  landmark: Landmark,
  wallet: Wallet,
};

const DEFAULT_ICON: LucideIcon = Briefcase;

export function SocieteIcon({ icone, className }: { icone: string | null; className?: string }) {
  const Icon = (icone && ICONS[icone]) || DEFAULT_ICON;
  return <Icon className={className} />;
}
