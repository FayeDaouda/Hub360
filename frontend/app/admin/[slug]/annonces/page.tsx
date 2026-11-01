'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Megaphone, Plus } from 'lucide-react';
import { formatDateTime } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import {
  creerAnnonce,
  getAnnonces,
  lireAnnonce,
  retirerAnnonce,
  validerAnnonce,
  type Annonce,
  type NouvelleAnnonce,
  type VueAnnonces,
} from '@/lib/annonces';
import { useTitrePage } from '@/lib/layout-contexte';
import { CloseButton, Modal } from '@/components/ui/dialog';
import { Field, FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';
import { Pill } from '@/components/ui/pill';

type Props = { params: Promise<{ slug: string }> };

// Annonces (lot 12, 01/11/2026) : le fil des annonces adressées à sa
// société, au groupe ou à son équipe. Rédiger, publier sans validation,
// valider et retirer suivent la matrice (le serveur le dit et revérifie).
export default function AnnoncesPage(props: Props) {
  const { slug } = use(props.params);
  useTitrePage('Annonces');
  const [vue, setVue] = useState<VueAnnonces | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [redaction, setRedaction] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const charger = useCallback(() => {
    getAnnonces(slug)
      .then((v) => {
        setVue(v);
        setErreur(null);
      })
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Annonces indisponibles.'));
  }, [slug]);
  useEffect(charger, [charger]);

  async function agir(f: () => Promise<unknown>) {
    try {
      await f();
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’action a échoué.');
    }
  }

  if (!vue) return erreur ? <FieldError>{erreur}</FieldError> : <Skeleton size="sm" />;

  return (
    <div className="annonces">
      <div className="annonces-barre">
        <p className="annonces-intro">
          Les annonces de votre société, du groupe et de votre équipe, les plus récentes en premier.
        </p>
        {vue.peutRediger && (
          <button type="button" className="btn-primary" onClick={() => setRedaction(true)}>
            <Plus size={16} aria-hidden /> Nouvelle annonce
          </button>
        )}
      </div>
      {erreur && <FieldError>{erreur}</FieldError>}
      {info && (
        <p className="pi-aide" role="status">
          {info}
        </p>
      )}

      {vue.aValider.length > 0 && (
        <section className="panel glass-panel annonces-a-valider" aria-label="Annonces à valider">
          <h2>À valider · {vue.aValider.length}</h2>
          {vue.aValider.map((a) => (
            <CarteAnnonce key={a.id} annonce={a}>
              <button
                type="button"
                className="btn-primary btn-primary--sm"
                onClick={() => agir(() => validerAnnonce(slug, a.id))}
              >
                Publier
              </button>
            </CarteAnnonce>
          ))}
        </section>
      )}

      {vue.annonces.length === 0 ? (
        <p className="pi-aide">Aucune annonce pour l’instant.</p>
      ) : (
        vue.annonces.map((a) => (
          <CarteAnnonce key={a.id} annonce={a}>
            {a.importante && !a.lue && (
              <button
                type="button"
                className="btn-primary btn-primary--sm"
                onClick={() => agir(() => lireAnnonce(slug, a.id))}
              >
                <Check size={14} aria-hidden /> J’ai lu
              </button>
            )}
            {a.importante && a.lue && <Pill tone="succes">Lu</Pill>}
            {a.peutRetirer && (
              <button
                type="button"
                className="btn-ghost btn-ghost--sm"
                onClick={() => agir(() => retirerAnnonce(slug, a.id))}
              >
                Retirer
              </button>
            )}
          </CarteAnnonce>
        ))
      )}

      {redaction && (
        <NouvelleAnnonceModal
          equipes={vue.equipes}
          publieDirectement={vue.publieDirectement}
          onClose={() => setRedaction(false)}
          onEnvoyer={async (a) => {
            const r = await creerAnnonce(slug, a);
            setRedaction(false);
            setInfo(r.statut === 'publiee' ? 'Annonce publiée.' : 'Annonce envoyée pour validation avant publication.');
            charger();
          }}
        />
      )}
    </div>
  );
}

function CarteAnnonce({ annonce: a, children }: { annonce: Annonce; children?: React.ReactNode }) {
  return (
    <article className={`annonce${a.importante ? ' annonce--importante' : ''}`}>
      <header className="annonce-tete">
        <h3>
          {a.importante && <Megaphone size={16} aria-hidden />} {a.titre}
        </h3>
        <span className="annonce-meta">
          {a.destinataires} · {a.auteur}
          {a.publieeLe ? ` · ${formatDateTime(a.publieeLe)}` : ''}
          {a.lectures !== null ? ` · lue par ${a.lectures}` : ''}
        </span>
      </header>
      <p className="annonce-contenu">{a.contenu}</p>
      {children && <div className="annonce-actions">{children}</div>}
    </article>
  );
}

function NouvelleAnnonceModal({
  equipes,
  publieDirectement,
  onClose,
  onEnvoyer,
}: {
  equipes: { id: string; nom: string }[];
  publieDirectement: boolean;
  onClose: () => void;
  onEnvoyer: (a: NouvelleAnnonce) => Promise<void>;
}) {
  const [titre, setTitre] = useState('');
  const [contenu, setContenu] = useState('');
  const [audience, setAudience] = useState<NouvelleAnnonce['audience']>('societe');
  const [celluleId, setCelluleId] = useState(equipes[0]?.id ?? '');
  const [importante, setImportante] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await onEnvoyer({
        titre,
        contenu,
        audience,
        celluleId: audience === 'equipe' ? celluleId : undefined,
        importante,
      });
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'L’annonce n’a pas été envoyée.');
      setEnvoi(false);
    }
  }

  return (
    <Modal onClose={onClose} busy={envoi} portal labelledBy="annonce-titre">
      <header className="modal-header">
        <h2 id="annonce-titre">Nouvelle annonce</h2>
        <CloseButton onClick={onClose} disabled={envoi} />
      </header>
      <form className="modal-body annonce-formulaire" onSubmit={envoyer}>
        <Field label="Titre">
          <input
            className="field-input"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Message">
          <textarea
            className="field-input"
            rows={6}
            value={contenu}
            onChange={(e) => setContenu(e.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Destinataires">
          <select
            className="field-input"
            value={audience}
            onChange={(e) => setAudience(e.target.value as NouvelleAnnonce['audience'])}
          >
            <option value="societe">Toute la société</option>
            <option value="groupe">Tout le groupe</option>
            {equipes.length > 0 && <option value="equipe">Une équipe</option>}
          </select>
        </Field>
        {audience === 'equipe' && (
          <Field label="Équipe">
            <select className="field-input" value={celluleId} onChange={(e) => setCelluleId(e.target.value)}>
              {equipes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nom}
                </option>
              ))}
            </select>
          </Field>
        )}
        <label className="annonce-importante">
          <input type="checkbox" checked={importante} onChange={(e) => setImportante(e.target.checked)} />
          Importante : chaque destinataire est prévenu et confirme « J’ai lu »
        </label>
        {!publieDirectement && <p className="pi-aide">Votre annonce sera publiée après validation.</p>}
        {erreur && <FieldError>{erreur}</FieldError>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={envoi}>
            Annuler
          </button>
          <button type="submit" className="btn-primary" disabled={envoi}>
            {envoi ? 'Envoi…' : publieDirectement ? 'Publier' : 'Envoyer pour validation'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
