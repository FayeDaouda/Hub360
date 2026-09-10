'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { getNotifications, marquerNotificationsLues } from '@/lib/notifications';
import type { FluxNotifications } from '@/lib/types';

function ilYa(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86_400);
  return j === 1 ? 'hier' : `il y a ${j} j`;
}

export function ClocheNotifications({ slug }: { slug: string }) {
  const [flux, setFlux] = useState<FluxNotifications | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const boiteRef = useRef<HTMLDivElement>(null);

  function charger() {
    getNotifications(slug).then(setFlux).catch(() => setFlux(null));
  }

  useEffect(() => {
    getNotifications(slug).then(setFlux).catch(() => setFlux(null));
  }, [slug]);

  // Clic hors cadre + Échap ferment le panneau.
  useEffect(() => {
    if (!ouvert) return;
    function onDoc(e: MouseEvent) {
      if (boiteRef.current && !boiteRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [ouvert]);

  function basculer() {
    setOuvert((o) => {
      if (!o) charger(); // rafraîchit à l'ouverture
      return !o;
    });
  }

  async function toutLire() {
    try {
      setFlux(await marquerNotificationsLues(slug));
    } catch {
      /* on garde l'état courant */
    }
  }

  const nonLues = flux?.nonLues ?? 0;
  const elements = flux?.elements ?? [];

  return (
    <div className="notif" ref={boiteRef}>
      <button
        type="button"
        className="admin-cloche"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={
          nonLues > 0 ? `Notifications, ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'
        }
        onClick={basculer}
      >
        <Bell size={17} strokeWidth={1.75} aria-hidden />
        {nonLues > 0 && <span className="admin-cloche-badge">{nonLues}</span>}
      </button>

      {ouvert && (
        <div className="notif-menu" role="menu">
          <div className="notif-menu-tete">
            <span>Notifications</span>
            {nonLues > 0 && (
              <button type="button" className="notif-tout-lu" onClick={toutLire}>
                Tout marquer lu
              </button>
            )}
          </div>

          {elements.length === 0 ? (
            <p className="notif-vide">Rien à signaler.</p>
          ) : (
            <ul className="notif-liste">
              {elements.map((n) => {
                const corps = (
                  <>
                    <span className="notif-point" data-etat={n.derivee ? 'echeance' : n.lu ? 'lu' : 'nonlu'} aria-hidden />
                    <span className="notif-txt">
                      <span className="notif-titre">{n.titre}</span>
                      <span className="notif-meta">
                        {n.derivee ? 'Échéance' : ilYa(n.date)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.projetId ? (
                      <Link
                        href={`/collab/${slug}/projets/${n.projetId}`}
                        className="notif-item"
                        onClick={() => setOuvert(false)}
                      >
                        {corps}
                      </Link>
                    ) : (
                      <span className="notif-item">{corps}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
