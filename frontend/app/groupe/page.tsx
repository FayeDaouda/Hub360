'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocietes } from '@/lib/api';
import { clearSession, getSession } from '@/lib/auth';
import { destinationForSession } from '@/lib/session-redirect';
import { Societe, Session } from '@/lib/types';

// Vue d'ensemble du groupe — réservée à holding_admin (rôle transverse, pas
// lié à une société précise). Les autres rôles sont renvoyés vers leur
// propre destination (voir destinationForSession).
export default function GroupePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [societes, setSocietes] = useState<Societe[] | null>(null);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace('/');
      return;
    }
    if (current.role !== 'holding_admin') {
      router.replace(destinationForSession(current));
      return;
    }
    setSession(current);
    getSocietes().then(setSocietes);
  }, [router]);

  if (!session) return null;

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  return (
    <main>
      <header className="espace-header">
        <span>Vue d’ensemble du groupe</span>
        <button className="btn-ghost" onClick={handleLogout}>
          Se déconnecter
        </button>
      </header>
      <div className="espace-welcome">
        <h1>Bienvenue, {session!.utilisateur.prenom}</h1>
        <p>
          Connecté en tant qu’<strong>administrateur du groupe</strong>.
        </p>
        {societes && societes.length > 0 && (
          <ul className="groupe-societe-list">
            {societes.map((societe) => (
              <li key={societe.id}>{societe.nom}</li>
            ))}
          </ul>
        )}
        <p className="espace-note">
          Le pilotage détaillé de chaque société (utilisateurs, modules) arrivera dans une
          prochaine étape.
        </p>
      </div>
    </main>
  );
}
