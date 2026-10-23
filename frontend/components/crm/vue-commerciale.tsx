'use client';

import { useEffect, useState } from 'react';
import { AlarmClock, ChevronDown, FileWarning, Handshake, Send, TrendingUp, UserX, type LucideIcon } from 'lucide-react';
import { getVueCommerciale, type ElementCommercial, type EtapePipeline, type VueCommerciale } from '@/lib/crm';
import { formatMontant, formatMontantCompact } from '@/lib/format';

const VISIBLES = 6;
const RANG_TON: Record<ElementCommercial['ton'], number> = { risque: 0, attention: 1, info: 2 };
const GROUPE: Record<ElementCommercial['type'], { icone: LucideIcon; titre: string; action: string; rang: number }> = {
  lead_sans_proprietaire: { icone: UserX, titre: 'Lead sans propriétaire', action: 'Ouvrir', rang: 0 },
  fiche_incomplete: { icone: FileWarning, titre: 'Fiche à compléter', action: 'Compléter', rang: 1 },
  offre_chez_client: { icone: Send, titre: 'Offre chez le client', action: 'Ouvrir', rang: 2 },
  apporteur_incomplet: { icone: Handshake, titre: 'Fiche apporteur à compléter', action: 'Compléter', rang: 3 },
};
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const ETAPE: Record<EtapePipeline, { libelle: string; ton: string }> = {
  preparation: { libelle: 'En préparation', ton: 'neutre' },
  en_validation: { libelle: 'En validation CFO', ton: 'attention' },
  chez_client: { libelle: 'Chez le client', ton: 'info' },
  expiree: { libelle: 'Expirées', ton: 'risque' },
  signe: { libelle: 'Signées', ton: 'succes' },
  perdu: { libelle: 'Perdues', ton: 'neutre' },
};

// Vue commerciale du COO (revue COO, 22/10/2026), en tête du CRM : ce qui
// attend une action, puis la performance de l'année du pipeline choisi.
export function VueCommercialeCoo({ slug, annee, onOuvrir }: { slug: string; annee: string; onOuvrir: (dossierId: string) => void }) {
  const [vue, setVue] = useState<VueCommerciale | null>(null);
  const [tout, setTout] = useState(false);

  useEffect(() => {
    getVueCommerciale(slug, annee)
      .then(setVue)
      .catch(() => setVue(null));
  }, [slug, annee]);

  if (!vue) return null;
  const elements = [...vue.aTraiter].sort((a, b) => RANG_TON[a.ton] - RANG_TON[b.ton] || GROUPE[a.type].rang - GROUPE[b.type].rang || a.tri.localeCompare(b.tri));
  const urgents = elements.filter((e) => e.ton === 'risque').length;
  const visibles = tout ? elements : elements.slice(0, VISIBLES);
  const p = vue.performance;

  return (
    <div className="crm-coo">
      <section className="panel glass-panel at-rh" aria-label="À traiter aujourd’hui">
        <div className="at-rh-tete">
          <h2 className="dmd-titre">
            <AlarmClock size={17} aria-hidden /> À traiter aujourd’hui · {elements.length}
          </h2>
          {urgents > 0 && <span className="pill pill--risque">{urgents} en retard</span>}
        </div>
        {elements.length === 0 ? (
          <p className="dmd-note">Rien en attente : fiches, propriétaires, offres et apporteurs sont à jour.</p>
        ) : (
          <ul className="at-rh-liste">
            {visibles.map((e) => {
              const g = GROUPE[e.type];
              return (
                <li key={`${e.type}-${e.dossierId}`} className="at-rh-ligne" data-ton={e.ton}>
                  <span className="at-rh-icone" aria-hidden>
                    <g.icone size={16} />
                  </span>
                  <span className="at-rh-corps">
                    <strong>
                      {g.titre} · {e.code} · {e.client}
                    </strong>
                    <span className="cell-sub">{e.detail}</span>
                  </span>
                  <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => onOuvrir(e.dossierId)}>
                    {g.action}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {elements.length > VISIBLES && (
          <button type="button" className="at-rh-plus" aria-expanded={tout} onClick={() => setTout((x) => !x)}>
            <ChevronDown size={15} aria-hidden className={tout ? 'is-ouvert' : undefined} />
            {tout ? 'Réduire' : `Voir les ${elements.length - VISIBLES} autres`}
          </button>
        )}
      </section>

      <section className="panel glass-panel crm-perf" aria-labelledby="crm-perf-titre">
        <h2 id="crm-perf-titre" className="dmd-titre">
          <TrendingUp size={17} aria-hidden /> Performance commerciale · {p.annee}
        </h2>
        <dl className="crm-perf-chiffres">
          <div>
            <dt>Transformation</dt>
            <dd>{p.tauxTransformation === null ? '—' : `${p.tauxTransformation} %`}</dd>
            <span className="cell-sub">
              {pluriel(p.signes, 'signé')} sur {pluriel(p.leads, 'lead')}
              {p.enCours ? ` · ${p.enCours} en cours` : ''}
            </span>
          </div>
          <div>
            <dt>Délai lead → signature</dt>
            <dd>{p.delaiMoyenJours === null ? '—' : pluriel(p.delaiMoyenJours, 'jour')}</dd>
            <span className="cell-sub">moyenne des contrats signés</span>
          </div>
        </dl>
        {vue.pipelineHt && (
          <div className="crm-perf-pipeline" aria-label="Pipeline en FCFA HT">
            <p className="crm-perf-sous-titre">Pipeline en FCFA HT · offres de l’année</p>
            <ul>
              {vue.pipelineHt.map((t) => (
                <li key={t.etape} title={`${pluriel(t.dossiers, 'dossier')}, ${t.avecOffre} avec offre · ${formatMontant(t.totalHt)} HT`}>
                  <span className={`pill pill--${ETAPE[t.etape].ton}`}>{ETAPE[t.etape].libelle}</span>
                  <strong>{formatMontantCompact(t.totalHt)}</strong>
                  <span className="cell-sub">{pluriel(t.dossiers, 'dossier')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.apporteurs.length > 0 && (
          <table className="crm-perf-table">
            <thead>
              <tr>
                <th>Apporteur</th>
                <th>Leads</th>
                <th>Signés</th>
                {p.montants && <th>Signé HT</th>}
                <th>En cours</th>
                {p.montants && <th>Commissions versées</th>}
              </tr>
            </thead>
            <tbody>
              {p.apporteurs.map((a) => (
                <tr key={a.cle}>
                  <td>
                    {a.libelle}
                    {a.type !== 'direct' && <span className="cell-sub">{a.type === 'interne' ? 'interne' : 'externe'}</span>}
                  </td>
                  <td>{a.leads}</td>
                  <td>{a.signes}</td>
                  {p.montants && <td>{a.signeHt ? formatMontantCompact(a.signeHt) : '—'}</td>}
                  <td>{a.enCours}</td>
                  {p.montants && (
                    <td>
                      {a.type === 'direct' ? '—' : formatMontantCompact(a.commissionsVersees)}
                      {a.commissionsAPayer > 0 && <span className="cell-sub">{formatMontantCompact(a.commissionsAPayer)} à payer</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
