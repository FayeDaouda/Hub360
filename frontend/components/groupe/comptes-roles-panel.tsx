'use client';

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import { NouveauCompteModal, ResultatInvitation } from '@/components/groupe/nouveau-compte-modal';
import {
  changerActifCompte,
  changerRoleCompte,
  comparerRoles,
  definirSalaireCompte,
  getComptesGroupe,
  libelleRole,
  lireSaisieSalaire,
  renvoyerInvitation,
} from '@/lib/groupe';
import { formatMontant, formatNombre } from '@/lib/format';
import type {
  CompteGroupe,
  ComptesGroupe,
  InvitationCompte,
  RoleAttribuable,
  SocieteComptes,
  StatutCompteGroupe,
} from '@/lib/types';

const LIBELLE_STATUT: Record<StatutCompteGroupe, string> = {
  actif: 'Actif',
  en_attente: 'Invitation en attente',
  desactive: 'Désactivé',
};

// Salaire affiché dans le champ : « 850 000 », vide si non renseigné.
function afficherSalaire(valeur: number | null): string {
  return valeur === null ? '' : formatNombre(valeur);
}

function messageErreur(e: unknown, repli: string): string {
  return e instanceof ApiError ? e.message : repli;
}

// Comptes & rôles — administration du HUB (CIO, sept. 2026). Une ligne par
// personne et par société : son rôle (liste regroupée : rôles de la société,
// rôles transverses) et son salaire brut mensuel. Les comptes
// d'administration et la propre ligne de la personne connectée (`moiId`)
// sont en lecture seule — le serveur refuse de toute façon (409).
export function ComptesRolesPanel({ moiId }: { moiId: string }) {
  const [donnees, setDonnees] = useState<ComptesGroupe | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [societeId, setSocieteId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [nouveau, setNouveau] = useState(false);

  useEffect(() => {
    let annule = false;
    setErreur(null);
    getComptesGroupe()
      .then((d) => {
        if (annule) return;
        setDonnees(d);
        setSocieteId((actuelle) => actuelle ?? d.societes[0]?.id ?? null);
      })
      .catch((e) => {
        if (!annule) setErreur(messageErreur(e, 'Impossible de charger les comptes — le serveur ne répond pas.'));
      });
    return () => {
      annule = true;
    };
  }, [essai]);

  const societe = donnees?.societes.find((s) => s.id === societeId) ?? null;

  // Remplace un compte après une modification réussie (réponse serveur).
  function majCompte(maj: Partial<CompteGroupe> & { id: string }) {
    setDonnees((d) =>
      d && {
        societes: d.societes.map((s) =>
          s.id !== societeId
            ? s
            : { ...s, comptes: s.comptes.map((c) => (c.id === maj.id ? { ...c, ...maj } : c)) },
        ),
      },
    );
  }

  if (erreur) {
    return (
      <section className="groupe-panel glass-panel">
        <p className="groupe-erreur" role="alert">
          <CircleAlert size={18} aria-hidden />
          {erreur}
        </p>
        <button type="button" className="btn-ghost" onClick={() => setEssai((n) => n + 1)}>
          <RefreshCw size={15} aria-hidden /> Réessayer
        </button>
      </section>
    );
  }

  if (!donnees) {
    return (
      <section className="groupe-panel glass-panel" aria-busy="true" aria-label="Chargement des comptes">
        <div className="skeleton groupe-squelette-titre" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton groupe-squelette-ligne" />
        ))}
      </section>
    );
  }

  return (
    <section className="groupe-panel glass-panel" aria-labelledby="groupe-comptes-titre">
      <header className="groupe-panel-entete">
        <div>
          <h2 id="groupe-comptes-titre">Comptes &amp; rôles</h2>
          <p>
            Créez les comptes depuis les dossiers RH, attribuez à chacun son rôle dans la société et
            renseignez son salaire brut mensuel.
          </p>
          {societe && (
            <button type="button" className="btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => setNouveau(true)}>
              <Plus size={15} strokeWidth={2} aria-hidden /> Nouveau compte
            </button>
          )}
        </div>
        {societe && <Resume societe={societe} />}
      </header>

      {donnees.societes.length > 1 && (
        <div className="groupe-onglets" role="tablist" aria-label="Société">
          {donnees.societes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === societeId}
              className={`groupe-onglet${s.id === societeId ? ' est-actif' : ''}`}
              onClick={() => setSocieteId(s.id)}
            >
              {s.nom}
              <span className="groupe-onglet-compte">{s.comptes.length}</span>
            </button>
          ))}
        </div>
      )}

      {!societe ? (
        <p className="empty-state">Aucune société active.</p>
      ) : (
        <TableComptes
          societe={societe}
          moiId={moiId}
          recherche={recherche}
          onRecherche={setRecherche}
          onMaj={majCompte}
        />
      )}

      {nouveau && societe && (
        <NouveauCompteModal societe={societe} onClose={() => setNouveau(false)} onCree={() => setEssai((n) => n + 1)} />
      )}

      <p className="groupe-note">
        <ShieldCheck size={15} aria-hidden />
        Changer un rôle déconnecte la personne : ses nouveaux droits s’appliquent dès sa
        prochaine connexion. Le salaire n’est visible que dans cet espace.
      </p>
    </section>
  );
}

function Resume({ societe }: { societe: SocieteComptes }) {
  const salaries = societe.comptes.filter((c) => c.salaireBrutMensuel !== null);
  const masse = salaries.reduce((t, c) => t + (c.salaireBrutMensuel ?? 0), 0);
  const avecRoleMatrice = societe.comptes.filter((c) => !c.administration).length;
  return (
    <dl className="groupe-resume">
      <div>
        <dt>Comptes</dt>
        <dd>{societe.comptes.length}</dd>
      </div>
      <div>
        <dt>Rôles de direction</dt>
        <dd>{avecRoleMatrice}</dd>
      </div>
      <div>
        <dt>Masse salariale brute / mois</dt>
        <dd>
          {salaries.length ? formatMontant(masse) : '—'}
          <small>
            {salaries.length}/{societe.comptes.length} renseignés
          </small>
        </dd>
      </div>
    </dl>
  );
}

function TableComptes({
  societe,
  moiId,
  recherche,
  onRecherche,
  onMaj,
}: {
  societe: SocieteComptes;
  moiId: string;
  recherche: string;
  onRecherche: (v: string) => void;
  onMaj: (maj: Partial<CompteGroupe> & { id: string }) => void;
}) {
  const roles = useMemo(
    () => [...societe.rolesAttribuables].sort(comparerRoles),
    [societe.rolesAttribuables],
  );
  const terme = recherche.trim().toLowerCase();
  const comptes = terme
    ? societe.comptes.filter((c) =>
        `${c.prenom} ${c.nom} ${c.email} ${libelleRole(c.role.nom)}`.toLowerCase().includes(terme),
      )
    : societe.comptes;

  return (
    <>
      <label className="champ-recherche groupe-recherche">
        <Search size={16} aria-hidden />
        <input
          type="search"
          className="field-input"
          placeholder="Rechercher un nom, un e-mail, un rôle…"
          aria-label="Rechercher un compte"
          value={recherche}
          onChange={(e) => onRecherche(e.target.value)}
        />
      </label>

      {comptes.length === 0 ? (
        <p className="empty-state">Aucun compte ne correspond à cette recherche.</p>
      ) : (
        <table className="groupe-table">
          <thead>
            <tr>
              <th scope="col">Personne</th>
              <th scope="col">Statut</th>
              <th scope="col">Rôle</th>
              <th scope="col" className="groupe-col-salaire">
                Salaire brut mensuel
              </th>
            </tr>
          </thead>
          <tbody>
            {comptes.map((c) => (
              <LigneCompte
                key={c.id}
                compte={c}
                estMoi={c.id === moiId}
                societe={societe}
                roles={roles}
                onMaj={onMaj}
              />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function LigneCompte({
  compte,
  estMoi,
  societe,
  roles,
  onMaj,
}: {
  compte: CompteGroupe;
  estMoi: boolean;
  societe: SocieteComptes;
  roles: RoleAttribuable[];
  onMaj: (maj: Partial<CompteGroupe> & { id: string }) => void;
}) {
  const initiales = `${compte.prenom.charAt(0)}${compte.nom.charAt(0)}`.toUpperCase();
  return (
    <tr>
      <td data-libelle="Personne">
        <div className="groupe-personne">
          <span className="groupe-avatar" aria-hidden>
            {initiales}
          </span>
          <span>
            <strong>
              {compte.prenom} {compte.nom}
              {estMoi && <span className="groupe-moi">Vous</span>}
            </strong>
            <span className="groupe-email">{compte.email}</span>
          </span>
        </div>
      </td>
      <td data-libelle="Statut">
        <span className={`groupe-statut groupe-statut--${compte.statut}`}>
          {LIBELLE_STATUT[compte.statut]}
        </span>
        {!compte.administration && !estMoi && <ActionsCompte compte={compte} onMaj={onMaj} />}
      </td>
      <td data-libelle="Rôle">
        {compte.administration || estMoi ? (
          <span
            className="groupe-role-admin"
            title={
              estMoi
                ? 'Votre propre rôle ne se modifie pas ici (vous vous retireriez vos pouvoirs d’administration).'
                : 'Compte d’administration : son rôle ne se modifie pas depuis cet écran.'
            }
          >
            <ShieldCheck size={14} aria-hidden />
            {libelleRole(compte.role.nom)}
          </span>
        ) : (
          <SelectRole compte={compte} societe={societe} roles={roles} onMaj={onMaj} />
        )}
      </td>
      <td data-libelle="Salaire brut mensuel" className="groupe-col-salaire">
        <ChampSalaire compte={compte} onMaj={onMaj} />
      </td>
    </tr>
  );
}

// Invitation à renvoyer (en attente), désactivation (coupe les sessions) ou
// réactivation — jamais sur soi-même ni sur un compte d'administration.
function ActionsCompte({
  compte,
  onMaj,
}: {
  compte: CompteGroupe;
  onMaj: (maj: Partial<CompteGroupe> & { id: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationCompte | null>(null);

  async function agir() {
    if (
      compte.statut === 'actif' &&
      !window.confirm(`Désactiver le compte de ${compte.prenom} ${compte.nom} ? Ses sessions seront coupées immédiatement.`)
    ) {
      return;
    }
    setBusy(true);
    setErreur(null);
    try {
      if (compte.statut === 'en_attente') setInvitation(await renvoyerInvitation(compte.id));
      else onMaj(await changerActifCompte(compte.id, compte.statut !== 'actif'));
    } catch (e) {
      setErreur(messageErreur(e, 'Action impossible.'));
    } finally {
      setBusy(false);
    }
  }

  const libelle =
    compte.statut === 'en_attente' ? 'Renvoyer l’invitation' : compte.statut === 'actif' ? 'Désactiver' : 'Réactiver';
  return (
    <>
      <button type="button" className="btn-ghost btn-ghost--sm groupe-action-compte" onClick={agir} disabled={busy}>
        {busy ? '…' : libelle}
      </button>
      {erreur && <span className="field-erreur">{erreur}</span>}
      {invitation &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setInvitation(null)}>
            <div className="modal modal--sm" role="dialog" aria-modal="true" aria-label="Invitation" onClick={(e) => e.stopPropagation()}>
              <header className="modal-header">
                <h2>Invitation renvoyée</h2>
                <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setInvitation(null)}>
                  <X size={18} strokeWidth={1.75} />
                </button>
              </header>
              <div className="modal-body">
                <ResultatInvitation
                  {...invitation}
                  nom={`${compte.prenom} ${compte.nom}`}
                  email={compte.email}
                  onClose={() => setInvitation(null)}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

type EtatAction = { type: 'repos' } | { type: 'envoi' } | { type: 'ok' } | { type: 'erreur'; message: string };

function SelectRole({
  compte,
  societe,
  roles,
  onMaj,
}: {
  compte: CompteGroupe;
  societe: SocieteComptes;
  roles: RoleAttribuable[];
  onMaj: (maj: Partial<CompteGroupe> & { id: string }) => void;
}) {
  const [etat, setEtat] = useState<EtatAction>({ type: 'repos' });
  const propres = roles.filter((r) => !r.transverse);
  const transverses = roles.filter((r) => r.transverse);

  useEffect(() => {
    if (etat.type !== 'ok') return;
    const t = setTimeout(() => setEtat({ type: 'repos' }), 2500);
    return () => clearTimeout(t);
  }, [etat]);

  async function changer(roleId: string) {
    if (roleId === compte.role.id) return;
    setEtat({ type: 'envoi' });
    try {
      const maj = await changerRoleCompte(compte.id, societe.id, roleId);
      onMaj(maj);
      setEtat({ type: 'ok' });
    } catch (e) {
      setEtat({ type: 'erreur', message: messageErreur(e, 'Rôle non modifié — réessayez.') });
    }
  }

  return (
    <div className="groupe-cellule-action">
      <select
        className="groupe-role-select"
        aria-label={`Rôle de ${compte.prenom} ${compte.nom}`}
        value={compte.role.id}
        disabled={etat.type === 'envoi'}
        onChange={(e) => changer(e.target.value)}
      >
        {propres.length > 0 && (
          <optgroup label={societe.nom}>
            {propres.map((r) => (
              <option key={r.id} value={r.id}>
                {libelleRole(r.nom)}
              </option>
            ))}
          </optgroup>
        )}
        {transverses.length > 0 && (
          <optgroup label="Groupe (transverses)">
            {transverses.map((r) => (
              <option key={r.id} value={r.id}>
                {libelleRole(r.nom)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <EtatLigne etat={etat} ok="Rôle mis à jour" />
    </div>
  );
}

function ChampSalaire({
  compte,
  onMaj,
}: {
  compte: CompteGroupe;
  onMaj: (maj: Partial<CompteGroupe> & { id: string }) => void;
}) {
  const [texte, setTexte] = useState(afficherSalaire(compte.salaireBrutMensuel));
  const [etat, setEtat] = useState<EtatAction>({ type: 'repos' });
  // Échap annule : la perte de focus qui suit ne doit PAS enregistrer (le
  // onBlur lirait encore l'ancien texte, l'état React n'étant pas à jour).
  const annulation = useRef(false);

  useEffect(() => {
    setTexte(afficherSalaire(compte.salaireBrutMensuel));
  }, [compte.salaireBrutMensuel]);

  useEffect(() => {
    if (etat.type !== 'ok') return;
    const t = setTimeout(() => setEtat({ type: 'repos' }), 2500);
    return () => clearTimeout(t);
  }, [etat]);

  async function valider() {
    const lu = lireSaisieSalaire(texte);
    if ('erreur' in lu) {
      setEtat({ type: 'erreur', message: lu.erreur });
      return;
    }
    if (lu.valeur === compte.salaireBrutMensuel) {
      setTexte(afficherSalaire(lu.valeur));
      if (etat.type === 'erreur') setEtat({ type: 'repos' });
      return;
    }
    setEtat({ type: 'envoi' });
    try {
      const r = await definirSalaireCompte(compte.id, lu.valeur);
      onMaj({ id: compte.id, salaireBrutMensuel: r.salaireBrutMensuel });
      setTexte(afficherSalaire(r.salaireBrutMensuel));
      setEtat({ type: 'ok' });
    } catch (e) {
      setEtat({ type: 'erreur', message: messageErreur(e, 'Salaire non enregistré — réessayez.') });
    }
  }

  function surTouche(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      annulation.current = true;
      setTexte(afficherSalaire(compte.salaireBrutMensuel));
      setEtat({ type: 'repos' });
      e.currentTarget.blur();
    }
  }

  const invalide = etat.type === 'erreur';
  return (
    <div className="groupe-cellule-action">
      <div className={`groupe-salaire${invalide ? ' est-invalide' : ''}`}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="groupe-salaire-saisie"
          placeholder="Non renseigné"
          aria-label={`Salaire brut mensuel de ${compte.prenom} ${compte.nom}, en FCFA`}
          aria-invalid={invalide || undefined}
          value={texte}
          disabled={etat.type === 'envoi'}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={() => {
            if (annulation.current) {
              annulation.current = false;
              return;
            }
            valider();
          }}
          onKeyDown={surTouche}
        />
        <span className="groupe-salaire-devise" aria-hidden>
          FCFA
        </span>
      </div>
      <EtatLigne etat={etat} ok="Enregistré" />
    </div>
  );
}

function EtatLigne({ etat, ok }: { etat: EtatAction; ok: string }) {
  return (
    <span className={`groupe-etat groupe-etat--${etat.type}`} role="status" aria-live="polite">
      {etat.type === 'envoi' && <LoaderCircle size={13} className="groupe-etat-roue" aria-hidden />}
      {etat.type === 'ok' && (
        <>
          <Check size={13} aria-hidden /> {ok}
        </>
      )}
      {etat.type === 'erreur' && etat.message}
    </span>
  );
}
