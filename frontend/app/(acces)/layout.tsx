import type { ReactNode } from 'react';
import { CadreAcces } from '@/components/auth/acces';

// Groupe de routes des écrans d'accès (portail, connexion, mot de passe
// oublié, activation, réinitialisation) — les URL ne changent pas. Le cadre
// est posé ici pour rester monté d'un écran à l'autre : pas de rechargement
// du fond entre le portail et la connexion.
export default function AccesLayout({ children }: { children: ReactNode }) {
  return <CadreAcces>{children}</CadreAcces>;
}
