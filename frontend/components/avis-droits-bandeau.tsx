'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { getSession, remplacerSession } from '@/lib/auth';
import { getAvisDroits, getDroitsCourants, marquerAvisCompris, type AvisDroits } from '@/lib/avis-droits';

// Même cadence que la cloche (lib/use-notifications-poll.ts).
const INTERVALLE_MS = 15_000;
const PREFIXE = 'Vos droits ont changé · ';

// Avis « Vos droits ont changé » (matrice, 31/10/2026), en haut de chaque
// espace connecté : dès le changement si la personne est là, à sa prochaine
// visite sinon ; jusqu'à « J'ai compris ». À chaque nouvel avis, les droits du
// moment sont relus et la session remise à jour : menus, onglets et boutons
// suivent sans rechargement (le serveur, lui, les applique déjà).
export function AvisDroitsBandeau() {
  const [avis, setAvis] = useState<AvisDroits[]>([]);
  const [enCours, setEnCours] = useState(false);
  const vus = useRef<Set<string>>(new Set());

  const charger = useCallback(async () => {
    let liste: AvisDroits[];
    try {
      liste = await getAvisDroits();
    } catch {
      return; // réseau coupé ou session refusée (apiAuth s'en charge) : nouvel essai au prochain tour
    }
    setAvis(liste);
    const nouveaux = liste.filter((a) => !vus.current.has(a.id));
    if (!nouveaux.length) return;
    for (const a of nouveaux) vus.current.add(a.id);
    try {
      const { permissions } = await getDroitsCourants();
      const session = getSession();
      if (session) remplacerSession({ ...session, permissions });
    } catch {
      /* la prochaine lecture des droits (prolongation) les rapportera */
    }
  }, []);

  useEffect(() => {
    void charger();
    const id = window.setInterval(() => void charger(), INTERVALLE_MS);
    return () => window.clearInterval(id);
  }, [charger]);

  async function compris() {
    setEnCours(true);
    try {
      await marquerAvisCompris();
      setAvis([]);
    } catch {
      /* l'avis reste affiché : nouvel essai au clic suivant */
    } finally {
      setEnCours(false);
    }
  }

  if (!avis.length) return null;
  return (
    <section className="avis-droits" role="status" aria-live="polite" aria-label="Vos droits ont changé">
      <ShieldCheck size={18} aria-hidden className="avis-droits-icone" />
      <div className="avis-droits-texte">
        <p className="avis-droits-titre">Vos droits ont changé</p>
        <ul>
          {avis.map((a) => (
            <li key={a.id}>{a.message.startsWith(PREFIXE) ? a.message.slice(PREFIXE.length) : a.message}</li>
          ))}
        </ul>
        <p className="avis-droits-aide">Les écrans concernés sont déjà à jour.</p>
      </div>
      <button
        type="button"
        className="btn-primary btn-primary--sm avis-droits-bouton"
        onClick={compris}
        disabled={enCours}
      >
        J’ai compris
      </button>
    </section>
  );
}
