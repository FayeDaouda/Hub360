'use client';

// Son de notification (nouvelle notification stockée, nouveau message de
// chat reçu d'un autre) — décision boss, sept. 2026. Synthétisé via Web
// Audio (deux notes, enveloppe courte) plutôt qu'un fichier audio à charger :
// aucun asset à livrer, aucune licence à vérifier.
//
// Préférence par appareil (localStorage), pas par compte : personne d'autre
// n'a besoin de la lire, et ça évite d'ajouter un champ + une migration pour
// un simple bouton marche/arrêt (cf. principe tenu tout du long — construire
// précisément ce qu'il faut, pas plus).
const CLE_SON = 'hub_son_notifications';

export function sonActive(): boolean {
  try {
    return localStorage.getItem(CLE_SON) !== 'off';
  } catch {
    return true;
  }
}

export function definirSonActive(actif: boolean): void {
  try {
    localStorage.setItem(CLE_SON, actif ? 'on' : 'off');
  } catch {
    /* navigation privée / storage bloqué — le toggle reste sans effet persistant */
  }
}

let contexte: AudioContext | null = null;
let debloque = false;

// Politique d'autoplay des navigateurs : aucun son ne peut être déclenché par
// script tant que l'utilisateur n'a pas interagi une première fois avec la
// page. On écoute le tout premier clic/touche, où qu'il ait lieu dans l'app,
// pour créer/reprendre le contexte audio une bonne fois pour toutes.
function assurerDeblocage() {
  if (debloque || typeof window === 'undefined') return;
  const debloquer = () => {
    debloque = true;
    try {
      if (!contexte) contexte = new AudioContext();
      if (contexte.state === 'suspended') contexte.resume().catch(() => {});
    } catch {
      /* Web Audio indisponible — le son restera silencieusement inactif */
    }
    window.removeEventListener('click', debloquer);
    window.removeEventListener('keydown', debloquer);
  };
  window.addEventListener('click', debloquer);
  window.addEventListener('keydown', debloquer);
}

if (typeof window !== 'undefined') assurerDeblocage();

// Petit carillon à deux notes — silencieux si désactivé, si aucune
// interaction n'a encore eu lieu sur la page, ou si Web Audio est absent.
export function jouerSonNotification(): void {
  if (!sonActive() || !debloque || !contexte) return;
  const ctx = contexte;
  const maintenant = ctx.currentTime;
  [880, 1320].forEach((frequence, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequence;
    const debut = maintenant + i * 0.09;
    gain.gain.setValueAtTime(0, debut);
    gain.gain.linearRampToValueAtTime(0.18, debut + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(debut);
    osc.stop(debut + 0.26);
  });
}
