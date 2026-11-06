'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { useNotificationsPoll } from '@/lib/use-notifications-poll';
import { cibleNotification, estDecision, libelleAlerteDerivee } from '@/lib/notifications';
import { ouvrirConversation } from '@/lib/chat';
import type { NotificationItem, Session } from '@/lib/types';
import { definirSonActive, sonActive } from '@/lib/notification-sound';
import { NotifPopups } from '@/components/notif-popups';

function ilYa(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86_400);
  return j === 1 ? 'hier' : `il y a ${j} j`;
}

// Cloche du back-office : chaque notification ouvre l'écran concerné (ou la
// conversation, cf. cibleNotification) et, ouverte, passe en lue.
export function ClocheNotifications({ slug, session }: { slug: string; session: Session }) {
  const { flux, recharger, toutLire, marquerLue, popups, fermerPopup, resume, fermerResume } =
    useNotificationsPoll(slug);
  const router = useRouter();
  function ouvrir(n: NotificationItem) {
    marquerLue(n);
    setOuvert(false);
    const cible = cibleNotification(slug, n, session);
    if ('conversation' in cible) ouvrirConversation(cible.conversation);
    else router.push(cible.href);
  }
  const [ouvert, setOuvert] = useState(false);
  const boiteRef = useRef<HTMLDivElement>(null);
  // Lu après montage seulement (localStorage) — évite un mismatch d'hydratation
  // entre le rendu serveur (toujours "activé" par défaut) et la préférence
  // réelle de l'appareil.
  const [son, setSon] = useState(true);
  useEffect(() => setSon(sonActive()), []);
  // Revue CEO (22/10/2026) : les décisions ne se perdent plus dans les informations.
  const [onglet, setOnglet] = useState<'decisions' | 'informations'>('decisions');

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
  const tous = flux?.elements ?? [];
  const decisions = tous.filter(estDecision);
  const informations = tous.filter((n) => !estDecision(n));
  const nonLu = (l: typeof tous) => l.filter((n) => n.derivee || !n.lu).length;
  const elements = onglet === 'decisions' ? decisions : informations;

  return (
    <div className="notif" ref={boiteRef}>
      <button
        type="button"
        className="admin-cloche"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={nonLues > 0 ? `Notifications, ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'}
        onClick={basculer}
      >
        <Bell size={18} aria-hidden />
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
                {son ? <Volume2 size={15} aria-hidden /> : <VolumeX size={15} aria-hidden />}
              </button>
              {nonLues > 0 && (
                <button type="button" className="notif-tout-lu" onClick={toutLire}>
                  Tout marquer lu
                </button>
              )}
            </span>
          </div>

          <div className="notif-onglets" role="tablist" aria-label="Notifications">
            {(
              [
                ['decisions', 'Décisions', decisions],
                ['informations', 'Informations', informations],
              ] as const
            ).map(([cle, libelle, liste]) => (
              <button
                key={cle}
                type="button"
                role="tab"
                aria-selected={onglet === cle}
                className={onglet === cle ? 'is-active' : ''}
                onClick={() => setOnglet(cle)}
              >
                {libelle}
                {nonLu(liste) > 0 && <span className="notif-onglet-compte">{nonLu(liste)}</span>}
              </button>
            ))}
          </div>

          {elements.length === 0 ? (
            <p className="notif-vide">
              {onglet === 'decisions' ? 'Aucune décision ne vous attend.' : 'Rien à signaler.'}
            </p>
          ) : (
            <ul className="notif-liste">
              {elements.map((n) => {
                const corps = (
                  <>
                    <span
                      className="notif-point"
                      data-etat={n.derivee ? 'echeance' : n.lu ? 'lu' : 'nonlu'}
                      aria-hidden
                    />
                    <span className="notif-txt">
                      <span className="notif-titre">{n.titre}</span>
                      <span className="notif-meta">{n.derivee ? libelleAlerteDerivee(n) : ilYa(n.date)}</span>
                    </span>
                  </>
                );
                return (
                  <li key={n.id}>
                    <button type="button" className="notif-item" onClick={() => ouvrir(n)}>
                      {corps}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <NotifPopups
        popups={popups}
        resume={resume}
        onOuvrir={ouvrir}
        onFermer={fermerPopup}
        onFermerResume={fermerResume}
        onToutVoir={() => {
          recharger();
          setOuvert(true);
        }}
      />
    </div>
  );
}
