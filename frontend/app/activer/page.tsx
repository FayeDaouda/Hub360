import { Suspense } from 'react';
import { DefinirMotDePasse } from '@/components/definir-mot-de-passe';

export default function ActiverPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={<div className="auth-card"><h1>Chargement…</h1></div>}>
        <DefinirMotDePasse mode="activation" />
      </Suspense>
    </main>
  );
}
