'use client';

import { apiSociete } from './client-api';

// Notifications système sur cet appareil (Web Push, 02/11/2026) : le service
// worker (public/sw.js) reçoit les notifications du HUB même onglet fermé ;
// l'abonnement de l'appareil est enregistré côté serveur.
export type EtatPush = 'indisponible' | 'desactive_serveur' | 'refuse' | 'inactif' | 'actif';

const pris = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Clé VAPID (base64url) → octets attendus par pushManager.subscribe.
function versOctets(cle: string): Uint8Array {
  const b64 = (cle + '='.repeat((4 - (cle.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const enregistrement = () => navigator.serviceWorker.register('/sw.js', { scope: '/' });

export async function etatPush(slug: string): Promise<EtatPush> {
  if (!pris()) return 'indisponible';
  const { cle } = await apiSociete<{ cle: string | null }>(slug, '/notifications/push/cle');
  if (!cle) return 'desactive_serveur';
  if (Notification.permission === 'denied') return 'refuse';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const abonnement = await reg?.pushManager.getSubscription();
  return abonnement && Notification.permission === 'granted' ? 'actif' : 'inactif';
}

export async function activerPush(slug: string): Promise<EtatPush> {
  if (!pris()) return 'indisponible';
  const { cle } = await apiSociete<{ cle: string | null }>(slug, '/notifications/push/cle');
  if (!cle) return 'desactive_serveur';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'refuse' : 'inactif';
  const reg = await enregistrement();
  await navigator.serviceWorker.ready;
  const abonnement =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(cle) as BufferSource }));
  const json = abonnement.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await apiSociete(slug, '/notifications/push', {
    method: 'POST',
    body: { endpoint: json.endpoint, keys: json.keys, appareil: navigator.userAgent.slice(0, 120) },
  });
  return 'actif';
}

export async function desactiverPush(slug: string): Promise<EtatPush> {
  if (!pris()) return 'indisponible';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const abonnement = await reg?.pushManager.getSubscription();
  if (abonnement) {
    await apiSociete(slug, '/notifications/push', { method: 'DELETE', body: { endpoint: abonnement.endpoint } }).catch(
      () => {},
    );
    await abonnement.unsubscribe();
  }
  return 'inactif';
}

// Au démarrage : un appareil déjà autorisé garde son abonnement à jour (clé
// renouvelée par le navigateur, compte changé sur le même appareil).
export async function rafraichirPush(slug: string) {
  if (!pris() || Notification.permission !== 'granted') return;
  try {
    if ((await etatPush(slug)) !== 'desactive_serveur') await activerPush(slug);
  } catch {
    /* sans effet : l'appareil reste comme il est */
  }
}
