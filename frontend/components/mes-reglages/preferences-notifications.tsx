'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  CATEGORIES_NOTIFICATION,
  type CanauxCategorie,
  LIBELLES_CATEGORIE,
  type PreferencesNotifications,
} from '@hub/domain';
import { definirSonActive, sonActive } from '@/lib/notification-sound';
import { enregistrerPreferencesNotifications, usePreferencesNotifications } from '@/lib/preferences-notifications';
import { activerPush, desactiverPush, etatPush, type EtatPush } from '@/lib/push';

const CANAUX: { cle: keyof CanauxCategorie; libelle: string; aide: string }[] = [
  { cle: 'popup', libelle: 'Pop-up', aide: 'Carte à l’écran quand le HUB est ouvert' },
  { cle: 'son', libelle: 'Son', aide: 'Carillon à l’arrivée' },
  { cle: 'systeme', libelle: 'Appareil', aide: 'Notification de l’ordinateur ou du téléphone, même HUB fermé' },
];

const MESSAGE_PUSH: Record<EtatPush, string> = {
  indisponible:
    'Ce navigateur ne reçoit pas les notifications système (sur iPhone : ajoutez le HUB à l’écran d’accueil).',
  desactive_serveur: 'Les notifications système ne sont pas encore activées sur ce serveur.',
  refuse: 'Refusées dans le navigateur : autorisez-les dans les réglages du site (icône du cadenas).',
  inactif: 'Pas encore activées sur cet appareil.',
  actif: 'Actives sur cet appareil.',
};

// Préférences de notification (02/11/2026) : les mêmes sur tous les appareils
// de la personne, enregistrées à chaque changement ; l'activation système et
// le son restent propres à cet appareil.
export function PreferencesNotificationsBloc({ slug }: { slug: string }) {
  const enService = usePreferencesNotifications(slug);
  const [p, setP] = useState<PreferencesNotifications>(enService);
  const [push, setPush] = useState<EtatPush | null>(null);
  const [son, setSon] = useState(true);
  const [statut, setStatut] = useState<'enregistre' | 'erreur' | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setP(enService), [enService]);
  useEffect(() => {
    setSon(sonActive());
    etatPush(slug)
      .then(setPush)
      .catch(() => setPush('indisponible'));
  }, [slug]);

  // Enregistrement automatique, regroupé (0,5 s après le dernier changement).
  function changer(suivant: PreferencesNotifications) {
    setP(suivant);
    setStatut(null);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      enregistrerPreferencesNotifications(slug, suivant)
        .then(() => setStatut('enregistre'))
        .catch(() => setStatut('erreur'));
    }, 500);
  }

  return (
    <div className="rgn">
      <div className="rgn-appareil">
        <div>
          <strong>Sur cet appareil</strong>
          <span className="po-aide">{push ? MESSAGE_PUSH[push] : 'Vérification…'}</span>
        </div>
        {push === 'inactif' && (
          <button
            type="button"
            className="btn-primary btn-primary--sm"
            onClick={() =>
              activerPush(slug)
                .then(setPush)
                .catch(() => setPush('inactif'))
            }
          >
            Activer
          </button>
        )}
        {push === 'actif' && (
          <button
            type="button"
            className="btn-ghost btn-ghost--sm"
            onClick={() =>
              desactiverPush(slug)
                .then(setPush)
                .catch(() => {})
            }
          >
            Désactiver
          </button>
        )}
      </div>
      <label className="po-miennes">
        <input
          type="checkbox"
          checked={son}
          onChange={(e) => {
            definirSonActive(e.target.checked);
            setSon(e.target.checked);
          }}
        />
        Son sur cet appareil
      </label>

      <div className="rgn-grille" role="table" aria-label="Préférences par catégorie">
        <div className="rgn-ligne rgn-ligne--tete" role="row">
          <span role="columnheader">Catégorie</span>
          {CANAUX.map((c) => (
            <span key={c.cle} role="columnheader" title={c.aide}>
              {c.libelle}
            </span>
          ))}
        </div>
        {CATEGORIES_NOTIFICATION.map((cat) => (
          <div key={cat} className="rgn-ligne" role="row">
            <span role="cell">
              <strong>{LIBELLES_CATEGORIE[cat].libelle}</strong>
              <span className="po-aide">{LIBELLES_CATEGORIE[cat].aide}</span>
            </span>
            {CANAUX.map((c) => (
              <span key={c.cle} role="cell" className="rgn-case">
                <input
                  type="checkbox"
                  aria-label={`${LIBELLES_CATEGORIE[cat].libelle} · ${c.libelle}`}
                  checked={p.categories[cat][c.cle]}
                  onChange={(e) =>
                    changer({
                      ...p,
                      categories: { ...p.categories, [cat]: { ...p.categories[cat], [c.cle]: e.target.checked } },
                    })
                  }
                />
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="rgn-calme">
        <label className="po-miennes">
          <input
            type="checkbox"
            checked={p.calme.actif}
            onChange={(e) => changer({ ...p, calme: { ...p.calme, actif: e.target.checked } })}
          />
          Heures calmes : ni son ni notification de l’appareil
        </label>
        <span className="rgn-heures">
          de
          <input
            type="time"
            className="field-input"
            value={p.calme.debut}
            disabled={!p.calme.actif}
            aria-label="Début des heures calmes"
            onChange={(e) => changer({ ...p, calme: { ...p.calme, debut: e.target.value } })}
          />
          à
          <input
            type="time"
            className="field-input"
            value={p.calme.fin}
            disabled={!p.calme.actif}
            aria-label="Fin des heures calmes"
            onChange={(e) => changer({ ...p, calme: { ...p.calme, fin: e.target.value } })}
          />
        </span>
      </div>
      <p className="dmd-note rgn-statut" aria-live="polite">
        {statut === 'enregistre' ? (
          <>
            <Check size={14} aria-hidden /> Enregistré · s’applique à tous vos appareils
          </>
        ) : statut === 'erreur' ? (
          'Enregistrement impossible, réessayez.'
        ) : (
          'Les pop-ups restent visibles en heures calmes, sans son.'
        )}
      </p>
    </div>
  );
}
