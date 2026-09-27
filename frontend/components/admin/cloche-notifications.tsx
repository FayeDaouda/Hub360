'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { useNotificationsPoll } from '@/lib/use-notifications-poll';
import { lienNotificationAdmin } from '@/lib/notifications';
import type { Session } from '@/lib/types';
import { definirSonActive, sonActive } from '@/lib/notification-sound';
import { NotifToast } from '@/components/notif-toast';

function ilYa(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86_400);
  return j === 1 ? 'hier' : `il y a ${j} j`;
}

// Pendant civile de components/collab/cloche-notifications.tsx — seuls les
// liens changent : /admin, et les notifications du cycle CRM ouvrent le
// dossier (cf. lienNotificationAdmin).
export function ClocheNotifications({ slug, session }: { slug: string; session: Session }) {
  const { flux, recharger, toutLire, toast, fermerToast } = useNotificationsPoll(slug);
  const [ouvert, setOuvert] = useState(false);
  const boiteRef = useRef<HTMLDivElement>(null);
  // Lu après montage seulement (localStorage) — évite un mismatch d'hydratation
  // entre le rendu serveur (toujours "activé" par défaut) et la préférence
  // réelle de l'appareil.
  const [son, setSon] = useState(true);
  useEffect(() => setSon(sonActive()), []);

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
      if (!o) recharger();
      return !o;
    });
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
        <Bell size={18} strokeWidth={1.75} aria-hidden />
        {nonLues > 0 && <span className="admin-cloche-badge">{nonLues}</span>}
      </button>

      {ouvert && (
        <div className="notif-menu" role="menu">
          <div className="notif-menu-tete">
            <span>Notifications</span>
            <span className="notif-menu-actions">
              <button
                type="button"
                className="notif-son-toggle"
                aria-pressed={son}
                aria-label={son ? 'Couper le son des notifications' : 'Activer le son des notifications'}
                title={son ? 'Son activé' : 'Son coupé'}
                onClick={() => {
                  const suivant = !son;
                  setSon(suivant);
                  definirSonActive(suivant);
                }}
              >
                {son ? (
                  <Volume2 size={15} strokeWidth={1.75} aria-hidden />
                ) : (
                  <VolumeX size={15} strokeWidth={1.75} aria-hidden />
                )}
              </button>
              {nonLues > 0 && (
                <button type="button" className="notif-tout-lu" onClick={toutLire}>
                  Tout marquer lu
                </button>
              )}
            </span>
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
                const href = lienNotificationAdmin(slug, n, session);
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link
                        href={href}
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

      {toast && (
        <NotifToast
          notification={toast}
          href={lienNotificationAdmin(slug, toast, session)}
          onFermer={fermerToast}
        />
      )}
    </div>
  );
}
