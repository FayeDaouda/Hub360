import type { ReactNode } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';

// Le cadre (fond, présentation, sélecteur de thème) vit dans le layout : il
// reste monté pendant que la page charge la société — seule la carte passe
// du squelette (loading.tsx) au formulaire, sans rejouer l'animation
// d'entrée ni flasher le squelette du portail (app/loading.tsx).
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <AuthShell presentation>{children}</AuthShell>;
}
