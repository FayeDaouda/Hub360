'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import type { NotificationItem } from '@/lib/types';

type Props = {
  notification: NotificationItem;
  // Cible du clic — déjà résolue par l'appelant (préfixe /admin ou /collab).
  href: string | null;
  onFermer: () => void;
};

// Bandeau éphémère (5 s) affiché quand une notification arrive pendant que
// l'utilisateur est déjà sur une page — pas besoin d'ouvrir la cloche pour la
// voir. Se rétracte tout seul (cf. échange du 2026-09-17).
const DUREE_AVANT_SORTIE_MS = 4700;

export function NotifToast({ notification, href, onFermer }: Props) {
  const [sortie, setSortie] = useState(false);

  useEffect(() => {
    setSortie(false);
    const t = setTimeout(() => setSortie(true), DUREE_AVANT_SORTIE_MS);
    return () => clearTimeout(t);
  }, [notification.id]);

  if (typeof document === 'undefined') return null;

  const corps = (
    <>
      <Bell size={15} strokeWidth={1.75} aria-hidden />
      <span className="notif-toast-txt">{notification.titre}</span>
    </>
  );

  return createPortal(
    <div className="notif-toast-hote">
      <div className={`notif-toast${sortie ? ' notif-toast--sortie' : ''}`} role="status">
        {href ? (
          <Link href={href} className="notif-toast-corps" onClick={onFermer}>
            {corps}
          </Link>
        ) : (
          <span className="notif-toast-corps">{corps}</span>
        )}
        <button type="button" className="notif-toast-fermer" aria-label="Fermer" onClick={onFermer}>
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}
