'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { getFeuilleTemps } from '@/lib/facturation';

import { formatAmount, formatDate, formatDayMonth, formatHours } from '@hub/domain';
import { STATUTS_CRM, type DelaiTranche, type FeuilleTemps, type Projet } from '@/lib/types';
import { Pill, type PillTone } from '@/components/ui/pill';
import { Skeleton } from '@/components/ui/feedback';
import { FieldError } from '@/components/ui/field';

// Tableau de facturation : année sur deux chiffres, pour tenir dans la colonne.
const jjmmaa = (iso: string) => `${formatDayMonth(iso)}/${iso.slice(2, 4)}`;

const DELAI: Record<DelaiTranche['etat'], { ton: PillTone; texte: (j: number) => string }> = {
  payee: { ton: 'succes', texte: (j) => `payée en ${j} j` },
  a_echoir: { ton: 'info', texte: (j) => `échéance dans ${j} j` },
  en_retard: { ton: 'risque', texte: (j) => `en retard de ${j} j` },
  a_facturer: { ton: 'neutre', texte: (j) => `à facturer dans ${j} j` },
  facturation_en_retard: { ton: 'attention', texte: (j) => `à facturer · ${j} j de retard` },
  non_planifiee: { ton: 'neutre', texte: () => 'délai non fixé' },
};

type Props = {
  slug: string;
  dossiers: Projet[] | null; // leads du CRM
  onVoirFactures: () => void;
  onOuvrirOffre: (devisId: string) => void;
};

// Finances · Feuille de temps (maquette du boss, oct. 2026) : pour un dossier,
// le temps sur le pipe commercial, sur la facturation de l'offre, et le temps
// imputé au projet (calcul RH depuis les tâches assignées du gabarit).
export function OngletFeuilleTemps({ slug, dossiers, onVoirFactures, onOuvrirOffre }: Props) {
  const [client, setClient] = useState('');
  const [dossierId, setDossierId] = useState('');
  const [feuille, setFeuille] = useState<FeuilleTemps | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const clients = useMemo(
    () =>
      [...new Map((dossiers ?? []).map((d) => [d.client.id, d.client.nom])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1], 'fr'),
      ),
    [dossiers],
  );
  const proposes = useMemo(
    () => (dossiers ?? []).filter((d) => !d.archive && (!client || d.client.id === client)),
    [dossiers, client],
  );
  // Par défaut : le dossier onboard le plus récent, sinon le premier.
  useEffect(() => {
    if (proposes.length && !proposes.some((d) => d.id === dossierId)) {
      setDossierId((proposes.find((d) => d.statut === 'onboard') ?? proposes[0]).id);
    }
  }, [proposes, dossierId]);
  useEffect(() => {
    if (!dossierId) return;
    let annule = false;
    setErreur(null);
    getFeuilleTemps(slug, dossierId)
      .then((f) => !annule && setFeuille(f))
      .catch((e) => !annule && setErreur(e instanceof Error ? e.message : 'Feuille de temps indisponible.'));
    return () => {
      annule = true;
    };
  }, [slug, dossierId]);

  const f = feuille?.dossier.id === dossierId ? feuille : null;
  const i = f?.indicateurs;

  return (
    <div className="ft">
      <section className="panel glass-panel ft-entete">
        <div className="ft-filtres">
          <label>
            <span>Client</span>
            <select
              className="field-input"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={!dossiers}
            >
              <option value="">Tous les clients</option>
              {clients.map(([id, nom]) => (
                <option key={id} value={id}>
                  {nom}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Projet</span>
            <select
              className="field-input"
              value={dossierId}
              onChange={(e) => setDossierId(e.target.value)}
              disabled={!dossiers}
            >
              {proposes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {STATUTS_CRM[d.statut]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ft-tuiles">
          <Tuile
            titre="Cycle commercial"
            valeur={i?.cycleCommercialJours != null ? `${i.cycleCommercialJours} j` : '—'}
          >
            création du lead → bon pour accord ·{' '}
            {f && (
              <Link className="lien-inline" href={`/admin/${slug}/crm?dossier=${f.dossier.id}`}>
                ouvrir la fiche
              </Link>
            )}
          </Tuile>
          <Tuile
            titre="Signature → 1er encaissement"
            valeur={i?.signatureEncaissementJours != null ? `${i.signatureEncaissementJours} j` : '—'}
          >
            vitesse de transformation en cash ·{' '}
            <button type="button" className="lien-inline" onClick={onVoirFactures}>
              voir les factures
            </button>
          </Tuile>
          <Tuile titre="Heures imputées" valeur={i?.heuresImputees != null ? formatHours(i.heuresImputees) : '—'}>
            {i?.heuresPrevues != null ? `prévu ${formatHours(i.heuresPrevues)}` : 'projet non ouvert'}
            {f?.dossier.projet && (
              <>
                {' · '}
                <Link className="lien-inline" href={`/admin/${slug}/projets?projet=${f.dossier.projet.id}`}>
                  ouvrir le dossier projet
                </Link>
              </>
            )}
          </Tuile>
          <Tuile
            titre="Honoraires HT / heure imputée"
            valeur={i?.honorairesParHeure != null ? formatAmount(i.honorairesParHeure) : '—'}
            accent
          >
            {f?.offre && (
              <>
                sur {formatAmount(f.offre.montantHt)} HT signés ·{' '}
                <button type="button" className="lien-inline" onClick={() => onOuvrirOffre(f.offre!.id)}>
                  ouvrir l’offre
                </button>
              </>
            )}
          </Tuile>
        </div>
      </section>

      {erreur && <FieldError>{erreur}</FieldError>}
      {!f ? (
        !erreur && <Skeleton size="sm" />
      ) : (
        <div className="ft-colonnes">
          <div className="ft-gauche">
            <section className="panel glass-panel fin-carte">
              <div className="ft-titre">
                <h2 className="fin-carte-titre">Temps sur le pipe</h2>
                <span>
                  Statut actuel : {STATUTS_CRM[f.dossier.statut]}
                  {f.dernierEvenement && ` · dernier événement le ${formatDate(f.dernierEvenement)}`}
                </span>
              </div>
              <ol className="ft-pipe">
                {f.pipe.map((e) => (
                  <li key={e.cle} className={e.date ? 'is-atteinte' : undefined}>
                    <strong>{e.libelle}</strong>
                    <span className="fin-code">{e.date ? formatDate(e.date) : '—'}</span>
                    <span className={`ft-ecart${e.horsCible ? ' is-hors-cible' : ''}`}>
                      {e.ecartJours != null ? `+${e.ecartJours} j` : e.date ? '—' : ''}
                    </span>
                    <span className="ft-cible">{e.cible}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel glass-panel fin-carte">
              <div className="ft-titre">
                <h2 className="fin-carte-titre">Temps sur la facturation</h2>
                <span>Prévu = date de signature + délai figé dans l’offre</span>
              </div>
              {f.facturation.length === 0 ? (
                <p className="fin-pied">Aucune offre acceptée : rien à facturer pour ce dossier.</p>
              ) : (
                <div className="admin-table-wrap fin-table-wrap">
                  <table className="admin-table ft-table">
                    <thead>
                      <tr>
                        <th>Tranche</th>
                        <th>Prévue</th>
                        <th>Facturée</th>
                        <th>Échéance</th>
                        <th>Payée</th>
                        <th>Délai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.facturation.map((t) => {
                        const d = DELAI[t.delai.etat];
                        return (
                          <tr key={t.cle}>
                            <td data-label="Tranche">
                              <span className="cell-stack">
                                <strong className="ft-tranche" title={`${t.famille} · ${t.tranche} · ${t.declencheur}`}>
                                  {t.famille.split(' · ')[0]} · {t.tranche} · {t.declencheur}
                                </strong>
                                <span className="cell-sub fin-code">
                                  {t.reference ? `${t.reference} · ` : ''}
                                  {formatAmount(t.montantTtc)}
                                </span>
                              </span>
                            </td>
                            <td data-label="Prévue">{t.prevue ? jjmmaa(t.prevue) : '—'}</td>
                            <td data-label="Facturée">{t.facturee ? jjmmaa(t.facturee) : '—'}</td>
                            <td data-label="Échéance">{t.echeance ? jjmmaa(t.echeance) : '—'}</td>
                            <td data-label="Payée">{t.payee ? jjmmaa(t.payee) : '—'}</td>
                            <td data-label="Délai">
                              <Pill tone={d.ton}>{d.texte('jours' in t.delai ? t.delai.jours : 0)}</Pill>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="panel glass-panel fin-carte ft-temps">
            <div className="ft-titre">
              <h2 className="fin-carte-titre">Temps imputé · calcul automatique</h2>
              {f.temps && (
                <span>
                  {formatHours(f.temps.total)} imputées
                  {f.temps.prevues != null && ` · ${formatHours(f.temps.prevues)} prévues`}
                </span>
              )}
            </div>
            <p className="ft-info">
              Aucune saisie : le temps vient de la durée standard des tâches assignées (gabarit GC-CONCEPTION), répartie
              sur leur fenêtre, hors absences validées. Contrôlé par la RH, non modifiable.
            </p>
            {!f.temps || f.temps.taches.length === 0 ? (
              <p className="fin-pied">
                {f.dossier.projet ? 'Aucune tâche assignée sur ce projet.' : 'Le projet n’est pas encore ouvert.'}
              </p>
            ) : (
              <>
                <h3 className="ft-sous-titre">Répartition par étape</h3>
                <ul className="ft-etapes">
                  {f.temps.repartition.map((e, n) => (
                    <li key={e.etape}>
                      <span>{e.etape}</span>
                      <span className="fin-jauge" aria-hidden>
                        <span
                          className={`ft-jauge ft-jauge--${n % 4}`}
                          style={{
                            width: `${(e.heures / Math.max(...f.temps!.repartition.map((x) => x.heures))) * 100}%`,
                          }}
                        />
                      </span>
                      <strong>{formatHours(e.heures)}</strong>
                    </li>
                  ))}
                </ul>
                <h3 className="ft-sous-titre">Tâches assignées</h3>
                <ul className="ft-taches">
                  {f.temps.taches.map((t) => (
                    <li key={t.id}>
                      <span className="fin-code">{t.debut ? formatDayMonth(t.debut) : '—'}</span>
                      <span className="ft-qui">
                        <strong>{t.assigne}</strong>
                        <small>{t.libelle}</small>
                      </span>
                      <span className="ft-detail">
                        {t.libelle} ·{' '}
                        {t.heuresStandard != null ? `${formatHours(t.heuresStandard)} standard` : 'sans durée standard'}{' '}
                        · {t.joursEcoules} j ouvrés écoulés
                      </span>
                      <strong>{formatHours(t.heures)}</strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Tuile({
  titre,
  valeur,
  accent,
  children,
}: {
  titre: string;
  valeur: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="ft-tuile">
      <span>{titre}</span>
      <strong className={accent ? 'is-accent' : undefined}>{valeur}</strong>
      <small>{children}</small>
    </div>
  );
}
