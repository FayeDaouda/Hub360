import type { ReactNode } from 'react';
import { ContenuAcces } from '@/components/auth/acces';

// Colonne de présentation + carte : posées dans le layout pour rester en
// place pendant que la page charge la société — seule la carte passe du
// squelette (loading.tsx) au formulaire, sans rejouer l'animation d'entrée.
// Le fond, lui, vient du layout du groupe (acces) et ne se recharge pas.
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <ContenuAcces presentation>{children}</ContenuAcces>;
}
