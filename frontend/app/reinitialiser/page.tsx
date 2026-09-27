import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { DefinirMotDePasse } from '@/components/definir-mot-de-passe';

export default function ReinitialiserPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <section className="auth-carte" aria-busy="true">
            <h1 className="auth-carte-titre">Chargement…</h1>
          </section>
        }
      >
        <DefinirMotDePasse mode="reset" />
      </Suspense>
    </AuthShell>
  );
}
