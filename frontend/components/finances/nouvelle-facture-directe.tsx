'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { creerFactureDirecte, getLeadsFacturables } from '@/lib/facturation';
import { formatAmount } from '@/lib/format';
import { STATUTS_CRM, type FactureCentrale, type LeadFacturable } from '@/lib/types';
import { CloseButton, Drawer } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';

const TAUX_TVA = 18; // TVA par défaut des factures (backend TAUX_TVA_DEFAUT)

type Ligne = { designation: string; montant: string };
const LIGNE_VIDE: Ligne = { designation: '', montant: '' };
const montantDe = (l: Ligne) => {
  const n = Number(l.montant.replace(/\s/g, ''));
  return Number.isInteger(n) && n > 0 ? n : 0;
};

type Props = {
  slug: string;
  dossierPresel?: string; // arrivée depuis la fiche CRM (« Émettre une facture directe »)
  onCreee: (f: FactureCentrale) => void;
  onClose: () => void;
};

// « Nouvelle facture » (maquette Finances, oct. 2026) : facture directe d'un
// lead, sans offre — par exemple un diagnostic CO0 au forfait. Préparée ici,
// elle reste à valider par le CFO avant émission (numéro attribué alors).
export function NouvelleFactureDirecte({ slug, dossierPresel, onCreee, onClose }: Props) {
  const [leads, setLeads] = useState<LeadFacturable[] | null>(null);
  const [dossierId, setDossierId] = useState(dossierPresel ?? '');
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getLeadsFacturables(slug)
      .then(setLeads)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Leads indisponibles.'));
  }, [slug]);

  const lead = leads?.find((l) => l.id === dossierId) ?? null;
  const valides = lignes.filter((l) => l.designation.trim() && montantDe(l) > 0);
  const ht = valides.reduce((t, l) => t + montantDe(l), 0);
  const tva = Math.round((ht * TAUX_TVA) / 100);
  const pret =
    !!lead &&
    valides.length > 0 &&
    valides.length === lignes.filter((l) => l.designation.trim() || l.montant.trim()).length;
  const majLigne = (i: number, maj: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...maj } : l)));

  async function preparer() {
    if (!lead) return;
    setEnvoi(true);
    setErreur(null);
    try {
      onCreee(
        await creerFactureDirecte(slug, {
          dossierCrmId: lead.id,
          lignes: valides.map((l) => ({ designation: l.designation.trim(), montantHt: montantDe(l) })),
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La facture n’a pas pu être préparée.');
      setEnvoi(false);
    }
  }

  return (
    <Drawer onClose={onClose} as="aside" labelledBy="nfd-titre">
      <header className="fiche-crm-entete">
        <div>
          <p className="fiche-crm-titre">Nouvelle facture</p>
          <h2 id="nfd-titre" className="fiche-crm-code">
            {lead ? lead.prochaineReference : '—'}
          </h2>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="field">
        <label className="field-label" htmlFor="nfd-lead">
          Lead à facturer
        </label>
        <select
          id="nfd-lead"
          className="field-input"
          value={dossierId}
          onChange={(e) => setDossierId(e.target.value)}
          disabled={!leads}
        >
          <option value="">— Choisir un lead du CRM —</option>
          {(leads ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.code} · {l.client}
            </option>
          ))}
        </select>
        {lead && (
          <span className="fiche-crm-meta">
            {lead.client} · {lead.localisation} · statut CRM : {STATUTS_CRM[lead.statut]}
          </span>
        )}
      </div>

      <section className="fiche-crm-carte nfd-bloc">
        <h3 className="fiche-crm-titre">Facture directe (sans offre)</h3>
        <p className="fiche-crm-aide">
          Pour une prestation facturée directement depuis le lead, par exemple un diagnostic CO0 au forfait.
        </p>
        {lignes.map((l, i) => (
          <div key={i} className="nfd-ligne">
            <input
              className="field-input"
              aria-label={`Désignation, ligne ${i + 1}`}
              placeholder="ex. CO0 · Diagnostic produit et positionnement"
              maxLength={200}
              value={l.designation}
              onChange={(e) => majLigne(i, { designation: e.target.value })}
            />
            <input
              className="field-input"
              aria-label={`Montant HT, ligne ${i + 1}`}
              placeholder="Montant HT"
              inputMode="numeric"
              value={l.montant}
              onChange={(e) => majLigne(i, { montant: e.target.value })}
            />
            <button
              type="button"
              className="fp-retirer"
              aria-label={`Retirer la ligne ${i + 1}`}
              disabled={lignes.length === 1}
              onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="fp-ajouter"
          disabled={lignes.length >= 20}
          onClick={() => setLignes((ls) => [...ls, { ...LIGNE_VIDE }])}
        >
          + Ajouter une ligne
        </button>
        <p className="nfd-totaux">
          <span>
            HT <strong>{formatAmount(ht)}</strong>
          </span>
          <span>
            TVA {TAUX_TVA} % <strong>{formatAmount(tva)}</strong>
          </span>
          <span>
            TTC <strong className="nfd-ttc">{formatAmount(ht + tva)}</strong>
          </span>
        </p>
        {erreur && <FieldError>{erreur}</FieldError>}
        {pret ? (
          <button type="button" className="btn-primary nfd-preparer" disabled={envoi} onClick={preparer}>
            {envoi ? 'Préparation…' : 'Préparer la facture · à valider par le CFO'}
          </button>
        ) : (
          <button type="button" className="offre-bloquee-bouton" disabled>
            {lead ? 'Renseigner au moins une ligne avec un montant' : 'Choisir un lead du CRM'}
          </button>
        )}
      </section>
    </Drawer>
  );
}
