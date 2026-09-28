import { Suspense } from 'react';
import { ContenuAcces } from '@/components/auth/acces';
import { DefinirMotDePasse } from '@/components/definir-mot-de-passe';

export default function ActiverPage() {
  return (
    <ContenuAcces>
      <Suspense
        fallback={
          <section className="auth-carte" aria-busy="true">
            <h1 className="auth-carte-titre">Chargement…</h1>
          </section>
        }
      >
        <DefinirMotDePasse mode="activation" />
      </Suspense>
    </ContenuAcces>
  );
}
