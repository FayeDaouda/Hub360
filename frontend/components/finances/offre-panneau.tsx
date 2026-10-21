'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { agirSurDossier, completudeFiche } from '@/lib/crm';
import { creerDevis, getDevis, majDevis } from '@/lib/devis';
import { COMMODITES } from '@/lib/fiche-programme';
import { identiteSociete, jjmmaaaa } from '@/lib/finances';
import { CATEGORIES, GAMMES, STANDINGS, type Devis, type ProduitService, type Projet, type Societe } from '@/lib/types';
import { lignesDepuisDevis, ligneVide, type LigneForm } from '@/components/admin/lignes-devis-editeur';
import { OffreLignes, lignesBrouillon } from './offre-lignes';
import { OffreAnnexes } from './offre-annexes';

const ENREGISTREMENT_MS = 700;
const LIBELLES_COMMODITES = new Map(COMMODITES.flatMap((g) => g.items));

type Props = {
  slug: string;
  societe: Societe;
  catalogue: ProduitService[];
  leads: Projet[] | null; // dossiers du CRM (null = en chargement)
  devisId?: string; // brouillon à reprendre
  dossierPresel?: string; // lead choisi depuis le CRM (« Continuer vers le devis »)
  onClose: () => void;
  onMaj: () => void; // offre créée ou soumise (la page recharge aussi à la fermeture)
};

// Nouvelle offre (maquette Finances, oct. 2026) : 1 · pour qui (lead du CRM
// en « Nouveau projet » sans offre en cours, ou nouveau client → fiche du
// lead dans le CRM d'abord), puis le document — client, message, lead lié,
// récapitulatif du programme, prestations, échéancier, conditions, CGV.
// Enregistré automatiquement ; la soumission fait passer le lead « En
// validation » dans le CRM, fiche complète et prestations chiffrées exigées.
export function OffrePanneau({ slug, societe, catalogue, leads, devisId, dossierPresel, onClose, onMaj }: Props) {
  const [mode, setMode] = useState<'lead' | 'nouveau'>('lead');
  const [devis, setDevis] = useState<Devis | null>(null);
  const [lignes, setLignes] = useState<LigneForm[]>([ligneVide()]);
  const [message, setMessage] = useState<string | null>(null); // null = texte généré
  const [adresse, setAdresse] = useState<string | null>(null); // null = inchangée
  const [ninea, setNinea] = useState<string | null>(null); // null = inchangé
  const [delais, setDelais] = useState<Record<string, string>>({});
  const [etat, setEtat] = useState<'pret' | 'modifie' | 'enregistrement'>('pret');
  const [erreur, setErreur] = useState<string | null>(null);
  const [soumission, setSoumission] = useState(false);
  const creation = useRef(false);
  const sequence = useRef(0); // réponses arrivées dans le désordre ignorées
  const revision = useRef(0); // saisies faites pendant un enregistrement

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose]);

  const ouvrir = useCallback((d: Devis) => {
    setDevis(d);
    setLignes(lignesDepuisDevis(d.lignes));
    setMessage(d.messageIntroductionPersonnalise ? d.messageIntroduction : null);
    setAdresse(null);
    setNinea(null);
    setDelais(Object.fromEntries(Object.entries(d.delaisEcheancier).map(([k, v]) => [k, String(v)])));
    setEtat('pret');
  }, []);

  // Leads proposés : « Nouveau projet », actifs, sans offre en cours.
  const proposables = useMemo(
    () =>
      (leads ?? []).filter(
        (p) => p.statut === 'nouveau_projet' && !p.archive && !(p.offre && ['brouillon', 'envoye'].includes(p.offre.statutEffectif)),
      ),
    [leads],
  );

  // Brouillon de l'offre d'un lead : une ligne de conception pré-remplie
  // depuis la fiche (catégorie CO, surface, planches).
  const demarrer = useCallback(
    async (lead: Projet) => {
      if (creation.current) return;
      creation.current = true;
      setErreur(null);
      try {
        if (lead.offre?.statutEffectif === 'brouillon') return ouvrir(await getDevis(slug, lead.offre.id));
        const co = catalogue.find((p) => p.code === lead.categorieConception) ?? catalogue.find((p) => p.modeCalcul === 'surface_planches');
        const d = await creerDevis(slug, {
          clientId: lead.client.id,
          dossierCrmId: lead.id,
          lignes: co
            ? [
                {
                  produitServiceId: co.id,
                  designation: co.designation,
                  quantite: 1,
                  prixUnitaire: co.prixUnitaire ?? 0,
                  tauxTva: co.tauxTva,
                  surfaceM2: lead.surfaceTerrain || undefined,
                  planches: lead.nbPlanches || undefined,
                },
              ]
            : [],
        });
        ouvrir(d);
        onMaj();
      } catch (e) {
        creation.current = false;
        setErreur(e instanceof Error && e.message ? e.message : 'L’offre n’a pas pu être créée.');
      }
    },
    [slug, catalogue, ouvrir, onMaj],
  );

  useEffect(() => {
    if (devisId) {
      getDevis(slug, devisId)
        .then(ouvrir)
        .catch(() => setErreur('Impossible de charger l’offre.'));
    }
  }, [slug, devisId, ouvrir]);
  useEffect(() => {
    const lead = dossierPresel ? leads?.find((p) => p.id === dossierPresel) : undefined;
    if (lead && !devisId && catalogue.length) void demarrer(lead);
  }, [dossierPresel, leads, devisId, catalogue.length, demarrer]);

  const lead = devis?.dossierCrm ? leads?.find((p) => p.id === devis.dossierCrm!.id) : undefined;

  // Enregistrement automatique, après une courte pause de saisie.
  const sauver = useCallback(async () => {
    if (!devis) return;
    const n = ++sequence.current;
    const rev = revision.current;
    setEtat('enregistrement');
    try {
      const d = await majDevis(slug, devis.id, {
        lignes: lignesBrouillon(lignes, catalogue),
        messageIntroduction: message,
        delaisEcheancier: Object.fromEntries(
          Object.entries(delais).flatMap(([k, v]) => (v.trim() === '' ? [] : [[k, Math.round(Number(v))]])),
        ),
        ...(adresse != null && { adresseClient: adresse }),
        ...(ninea != null && { nineaClient: ninea }),
      });
      if (n !== sequence.current) return; // une saisie plus récente part déjà
      setDevis(d);
      setErreur(null);
      setEtat(revision.current === rev ? 'pret' : 'modifie');
    } catch (e) {
      if (n !== sequence.current) return;
      setErreur(e instanceof Error && e.message ? e.message : 'Enregistrement impossible.');
      setEtat('modifie');
    }
  }, [slug, devis, lignes, catalogue, message, delais, adresse, ninea]);

  useEffect(() => {
    if (etat !== 'modifie') return;
    const t = window.setTimeout(() => void sauver(), ENREGISTREMENT_MS);
    return () => window.clearTimeout(t);
  }, [etat, sauver]);
  const modifier = <T,>(fixer: (v: T) => void) => (v: T) => {
    fixer(v);
    revision.current++;
    setEtat('modifie');
  };

  async function soumettre() {
    if (!devis?.dossierCrm) return;
    setSoumission(true);
    setErreur(null);
    try {
      if (etat !== 'pret') await sauver();
      await agirSurDossier(slug, devis.dossierCrm.id, 'soumettre');
      onMaj();
      onClose();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : 'La soumission a échoué.');
    } finally {
      setSoumission(false);
    }
  }

  const id = identiteSociete(societe.mentionsLegales, societe.coordonnees);
  const fiche = lead ? completudeFiche(lead) : null;
  const chiffree = !!devis?.lignes.some((l) => l.montantHt > 0);
  const incomplete = !!devis?.lignes.some((l) => l.quantite <= 0);
  const blocage = !chiffree
    ? 'Ajouter au moins une prestation chiffrée'
    : incomplete
      ? 'Compléter les prestations non chiffrées'
      : fiche && fiche.faits < fiche.total
        ? 'Compléter la fiche CRM pour soumettre au CFO'
        : null;
  const categorieCo = lignes.map((l) => catalogue.find((p) => p.id === l.produitServiceId)).find((p) => p?.modeCalcul === 'surface_planches')?.code ?? null;

  return (
    <div className="fiche-crm-fond" onClick={onClose}>
      <aside className="fiche-crm offre" role="dialog" aria-modal="true" aria-labelledby="offre-titre" onClick={(e) => e.stopPropagation()}>
        <header className="fiche-crm-entete">
          <div>
            <p className="fiche-crm-titre">Offre commerciale</p>
            <h2 id="offre-titre" className="fiche-crm-code fac-titre">
              {devis?.reference ?? 'Nouvelle offre'}
              <span className="pill pill--neutre">Brouillon</span>
            </h2>
            <p className="fiche-crm-meta">
              {devis
                ? [devis.client.nom, devis.dossierCrm?.code, `créée le ${jjmmaaaa(devis.creeLe)}`].filter(Boolean).join(' · ')
                : 'Choisir le lead ou créer le client'}
            </p>
          </div>
          <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {!devis && !devisId && (
          <section className="offre-carte">
            <h3 className="offre-titre-section">1 · Pour qui est cette offre ?</h3>
            <div className="offre-bascule" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'lead'} className={mode === 'lead' ? 'is-active' : ''} onClick={() => setMode('lead')}>
                Lead existant du CRM
              </button>
              <button type="button" role="tab" aria-selected={mode === 'nouveau'} className={mode === 'nouveau' ? 'is-active' : ''} onClick={() => setMode('nouveau')}>
                Nouveau client
              </button>
            </div>
            {mode === 'lead' ? (
              <label className="offre-choix">
                <span>Choisir le lead</span>
                <select
                  className="field-input"
                  value=""
                  disabled={!leads || creation.current}
                  onChange={(e) => {
                    const l = proposables.find((p) => p.id === e.target.value);
                    if (l) void demarrer(l);
                  }}
                >
                  <option value="">{leads ? '— Leads en « Nouveau projet » —' : 'Chargement…'}</option>
                  {proposables.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.client.nom}
                      {p.localite ? ` · ${p.localite.nom}` : ''}
                    </option>
                  ))}
                </select>
                <small>Seuls les leads en Nouveau projet, sans offre en cours, sont proposés.</small>
              </label>
            ) : (
              <div className="offre-nouveau">
                <strong>Nouveau projet : d’abord la fiche du lead, ensuite le devis.</strong>
                <p>
                  Le HUB ouvre la création du lead dans le CRM (client, localisation, fiche apporteur). Une fois la fiche créée
                  puis complétée (catégorie, type, fiche Programme), le bouton « Continuer vers le devis » ramène ici avec
                  l’offre pré-remplie.
                </p>
                <Link className="btn-primary offre-nouveau-bouton" href={`/admin/${slug}/crm?nouveau=1&depuis=finances`}>
                  Remplir la fiche du lead dans le CRM
                </Link>
              </div>
            )}
          </section>
        )}

        {devis && (
          <>
            <section className="offre-document">
              <div className="offre-document-tete">
                <div className="offre-client">
                  <span className="offre-etiquette">Client</span>
                  <strong>{devis.client.nom}</strong>
                  {devis.client.reference && <span>Réf. client {devis.client.reference}</span>}
                  <textarea
                    className={`offre-adresse${(adresse ?? devis.client.adresse ?? '').trim() ? '' : ' offre-a-renseigner'}`}
                    rows={3}
                    value={adresse ?? devis.client.adresse ?? ''}
                    placeholder="Adresse du client (reprise sur devis et factures)"
                    aria-label="Adresse du client"
                    onChange={(e) => modifier(setAdresse)(e.target.value)}
                  />
                  <input
                    className="offre-ninea"
                    value={ninea ?? devis.client.ninea ?? ''}
                    maxLength={40}
                    placeholder="NINEA du client (s'il en a un)"
                    aria-label="NINEA du client"
                    onChange={(e) => modifier(setNinea)(e.target.value)}
                  />
                </div>
                <div className="offre-emetteur">
                  <span className="offre-type">Devis</span>
                  {id.raisonSociale && <strong>{id.raisonSociale}</strong>}
                  {id.adresse && <span>{id.adresse}</span>}
                  {id.ville && <span>{id.ville}</span>}
                </div>
              </div>
              <div className="offre-document-corps">
                <dl className="offre-references">
                  <dt>Numéro</dt>
                  <dd className="fin-code">{devis.reference ?? '—'}</dd>
                  <dt>Date</dt>
                  <dd>{jjmmaaaa(devis.creeLe)}</dd>
                  <dt>Validité</dt>
                  <dd>7 jours après envoi</dd>
                </dl>
                <label className="offre-message">
                  <span className="offre-etiquette">Message d’introduction</span>
                  <textarea
                    rows={6}
                    value={message ?? devis.messageIntroduction}
                    onChange={(e) => modifier(setMessage)(e.target.value.trim() ? e.target.value : null)}
                  />
                  <small>Pré-rempli depuis la fiche projet ; modifiable tant que le devis est en brouillon.</small>
                </label>
              </div>
            </section>

            {lead && fiche && (
              <section className="offre-carte">
                <div className="offre-titre-ligne">
                  <h3 className="offre-titre-section">Lead CRM lié</h3>
                  <span className={`pill ${fiche.faits === fiche.total ? 'pill--succes' : 'pill--attention'}`}>
                    Fiche {fiche.faits}/{fiche.total}
                  </span>
                </div>
                <p className="offre-lead">
                  {lead.client.nom} · {lead.localite?.nom ?? (lead.localisation || 'localisation à choisir')} ·{' '}
                  {lead.categorie ? CATEGORIES[lead.categorie] : 'catégorie à choisir'}
                </p>
                <p className="offre-aide">{lead.programme || 'Fiche Programme à remplir'}</p>
                {fiche.faits < fiche.total && (
                  <div className="offre-alerte">
                    <span>La fiche CRM est incomplète : l’offre peut être préparée, mais pas soumise au CFO.</span>
                    <Link className="btn-ghost btn-ghost--sm" href={`/admin/${slug}/crm?dossier=${lead.id}`}>
                      Compléter dans le CRM
                    </Link>
                  </div>
                )}
              </section>
            )}

            {lead && (
              <section className="offre-carte">
                <div className="offre-titre-ligne">
                  <h3 className="offre-titre-section">Récapitulatif du programme · repris sur le devis</h3>
                  <span className="offre-badge">Annexe 1 · Fiche Programme jointe</span>
                </div>
                <dl className="offre-programme">
                  <Champ titre="Localisation" valeur={lead.localite ? `${lead.localite.nom} (${lead.localite.code})` : lead.localisation || null} />
                  <Champ titre="Catégorie" valeur={lead.categorie ? CATEGORIES[lead.categorie] : null} />
                  <Champ titre="Catégorie CO" valeur={categorieCo} />
                  <Champ titre="Surface" valeur={lead.surfaceTerrain > 0 ? `${lead.surfaceTerrain.toLocaleString('fr-FR')} m²` : null} />
                  <Champ titre="Planches" valeur={lead.nbPlanches > 0 ? String(lead.nbPlanches) : null} />
                  <Champ titre="Standing" valeur={lead.standing ? STANDINGS[lead.standing] : null} />
                  <Champ titre="Gamme" valeur={lead.gamme ? GAMMES[lead.gamme] : null} />
                  <Champ
                    titre="Surface × planches"
                    valeur={lead.surfaceTerrain > 0 && lead.nbPlanches > 0 ? `${(lead.surfaceTerrain * lead.nbPlanches).toLocaleString('fr-FR')} m²` : null}
                  />
                </dl>
                <p className="offre-programme-resume">{lead.programme || 'Fiche Programme à remplir'}</p>
                <p className="offre-commodites">
                  <strong>Commodités :</strong>{' '}
                  {lead.ficheProgramme?.commodites.length
                    ? lead.ficheProgramme.commodites.map((c) => LIBELLES_COMMODITES.get(c) ?? c).join(', ')
                    : 'aucune'}
                </p>
              </section>
            )}

            <OffreLignes
              lignes={lignes}
              onChange={modifier(setLignes)}
              catalogue={catalogue}
              categorieCo={null}
              fiche={{ surface: lead?.surfaceTerrain ?? 0, planches: lead?.nbPlanches ?? 0 }}
            />
            <OffreAnnexes
              societe={societe}
              totaux={{ ht: devis.montantHt, tva: devis.montantTva, ttc: devis.montantTtc }}
              echeancier={devis.echeancier ?? []}
              delais={delais}
              onDelai={(cle, v) => modifier(setDelais)({ ...delais, [cle]: v })}
            />

            <div className="offre-soumission">
              <button
                type="button"
                className={blocage ? 'offre-soumettre' : 'btn-primary offre-soumettre'}
                disabled={!!blocage || soumission || etat === 'enregistrement'}
                onClick={soumettre}
              >
                {blocage ?? (soumission ? 'Soumission…' : 'Soumettre au CFO')}
              </button>
              <p className="offre-aide">
                {etat === 'enregistrement' ? 'Enregistrement…' : 'Le brouillon est enregistré automatiquement.'} À la
                soumission, le lead passe en « En validation » dans le CRM.
              </p>
            </div>
          </>
        )}
        {erreur && <p className="field-erreur">{erreur}</p>}
      </aside>
    </div>
  );
}

function Champ({ titre, valeur }: { titre: string; valeur: string | null }) {
  return (
    <div>
      <dt>{titre}</dt>
      <dd className={valeur ? undefined : 'offre-a-completer'}>{valeur ?? 'À compléter'}</dd>
    </div>
  );
}
