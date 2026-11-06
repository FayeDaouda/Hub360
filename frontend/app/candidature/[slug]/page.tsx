'use client';

import { use, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { Briefcase, CalendarClock, CheckCircle2, FileUp, MapPin, Paperclip, Send, Users, X } from 'lucide-react';
import { formatLongDate, todayIso } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { FICHIERS_ACCEPTES, lireFichier } from '@/lib/fichiers';
import { candidater, getAppelPublic, type AppelPublic, type PieceDemandee } from '@/lib/candidature-publique';
import { BanniereMarque, PageIntrouvable, PiedMarque, Reperes } from '@/components/recrutement/public';
import { FieldError } from '@/components/ui/field';

type Props = { params: Promise<{ slug: string }> };
type Fichier = { nom: string; url: string; taille: number };

// Plafonds du dépôt : 8 Mo par pièce, 20 Mo en tout (le serveur revérifie ;
// son corps de requête est plafonné à 30 Mo, base64 compris).
const MAX_PIECE = 8 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;
const taille = (o: number) =>
  o >= 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.ceil(o / 1024)} Ko`;

// Appel à candidatures — page publique (sans compte, 01/11/2026) : le poste,
// puis le formulaire (identité, questions de la RH, pièces demandées,
// consentement). Envoyée, la candidature arrive dans le circuit du HUB et le
// candidat reçoit un accusé de réception.
export default function CandidaturePage(props: Props) {
  const { slug } = use(props.params);
  const [appel, setAppel] = useState<AppelPublic | null | undefined>(undefined);
  const [envoye, setEnvoye] = useState<{ reference: string; prenom: string; email: string } | null>(null);

  useEffect(() => {
    getAppelPublic(slug)
      .then((a) => {
        setAppel(a);
        document.title = `${a.poste} — ${a.societe.nom}`;
      })
      .catch(() => setAppel(null));
  }, [slug]);

  if (appel === undefined) {
    return (
      <main className="rp-page">
        <div className="rp-banniere rp-banniere--squelette skeleton" aria-hidden />
      </main>
    );
  }
  if (appel === null) {
    return (
      <PageIntrouvable
        titre="Offre introuvable"
        texte="Ce lien est incorrect ou l’offre a été retirée. Vérifiez l’adresse reçue."
      />
    );
  }

  return (
    <main className="rp-page">
      <BanniereMarque societe={appel.societe} surtitre="Offre d’emploi">
        <h1 className="rp-titre">{appel.poste}</h1>
        <Reperes
          items={[
            appel.lieu && (
              <>
                <MapPin size={15} aria-hidden /> {appel.lieu}
              </>
            ),
            appel.typeContrat && (
              <>
                <Briefcase size={15} aria-hidden /> {appel.typeContrat}
              </>
            ),
            appel.equipe && (
              <>
                <Users size={15} aria-hidden /> {appel.equipe}
              </>
            ),
            appel.dateLimite && (
              <>
                <CalendarClock size={15} aria-hidden /> Jusqu’au {formatLongDate(appel.dateLimite)}
              </>
            ),
          ]}
        />
        {appel.ouvert && !envoye && (
          <a href="#postuler" className="rp-cta">
            Postuler <Send size={16} aria-hidden />
          </a>
        )}
      </BanniereMarque>

      <div className="rp-grille">
        <article className="rp-carte rp-presentation">
          <h2>Le poste</h2>
          <p className="rp-texte">{appel.presentation}</p>
          <p className="rp-meta">Publiée le {formatLongDate(appel.publieLe.slice(0, 10))}</p>
        </article>

        <section id="postuler" className="rp-carte rp-formulaire" aria-labelledby="postuler-titre">
          {envoye ? (
            <Confirmation appel={appel} {...envoye} />
          ) : !appel.ouvert ? (
            <div className="rp-clos">
              <h2 id="postuler-titre">Candidatures closes</h2>
              <p>Cette offre ne reçoit plus de candidatures. Découvrez les autres offres de {appel.societe.nom}.</p>
              <Link href={`/carrieres/${appel.societe.slug}`} className="btn-primary">
                Voir les offres
              </Link>
            </div>
          ) : (
            <Formulaire slug={slug} appel={appel} onEnvoye={setEnvoye} />
          )}
        </section>
      </div>
      <PiedMarque societe={appel.societe} />
    </main>
  );
}

function Formulaire({
  slug,
  appel,
  onEnvoye,
}: {
  slug: string;
  appel: AppelPublic;
  onEnvoye: (e: { reference: string; prenom: string; email: string }) => void;
}) {
  const [f, setF] = useState({ prenom: '', nom: '', email: '', telephone: '' });
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [fichiers, setFichiers] = useState<Partial<Record<PieceDemandee['cle'], Fichier>>>({});
  const [consentement, setConsentement] = useState(false);
  const [piege, setPiege] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = (cle: keyof typeof f) => ({
    value: f[cle],
    onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [cle]: e.target.value })),
  });

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    const manquante = appel.pieces.find((p) => p.obligatoire && !fichiers[p.cle]);
    if (manquante) return setErreur(`Ajoutez la pièce obligatoire : ${manquante.libelle}.`);
    const total = Object.values(fichiers).reduce((t, x) => t + (x?.taille ?? 0), 0);
    if (total > MAX_TOTAL) return setErreur('Vos pièces dépassent 20 Mo au total : allégez-en une.');
    setEnvoi(true);
    try {
      const r = await candidater(slug, {
        ...f,
        reponses,
        pieces: Object.entries(fichiers).map(([cle, x]) => ({
          cle: cle as PieceDemandee['cle'],
          nom: x!.nom,
          url: x!.url,
        })),
        consentement,
        siteWeb: piege || undefined,
      });
      onEnvoye({ reference: r.reference, prenom: f.prenom.trim(), email: f.email.trim() });
      document.getElementById('postuler')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.status === 413
            ? 'Vos pièces sont trop lourdes : allégez-les puis réessayez.'
            : err.message
          : 'L’envoi a échoué. Vérifiez votre connexion puis réessayez.',
      );
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={envoyer} noValidate={false}>
      <h2 id="postuler-titre">Postuler</h2>
      <p className="rp-aide">
        Les champs marqués <span className="rp-requis">*</span> sont obligatoires.
      </p>

      <fieldset className="rp-groupe">
        <legend>Vous</legend>
        <div className="rp-ligne">
          <ChampTexte label="Prénom" requis autoComplete="given-name" {...champ('prenom')} />
          <ChampTexte label="Nom" requis autoComplete="family-name" {...champ('nom')} />
        </div>
        <div className="rp-ligne">
          <ChampTexte label="E-mail" type="email" requis autoComplete="email" {...champ('email')} />
          <ChampTexte
            label="Téléphone"
            type="tel"
            requis
            autoComplete="tel"
            minLength={6}
            placeholder="+221 …"
            {...champ('telephone')}
          />
        </div>
        {/* Piège à robots : invisible et ignoré par un humain. */}
        <div className="rp-piege" aria-hidden>
          <label>
            Site web
            <input tabIndex={-1} autoComplete="off" value={piege} onChange={(e) => setPiege(e.target.value)} />
          </label>
        </div>
      </fieldset>

      {appel.questions.length > 0 && (
        <fieldset className="rp-groupe">
          <legend>Quelques questions</legend>
          {appel.questions.map((q) => (
            <label key={q.id} className="rp-champ">
              <span>
                {q.libelle}
                {q.obligatoire && <span className="rp-requis"> *</span>}
              </span>
              <textarea
                rows={3}
                maxLength={3000}
                required={q.obligatoire}
                value={reponses[q.id] ?? ''}
                onChange={(e) => setReponses((x) => ({ ...x, [q.id]: e.target.value }))}
              />
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="rp-groupe">
        <legend>Vos documents</legend>
        <p className="rp-aide">PDF, Word, JPG ou PNG · 8 Mo par document, 20 Mo en tout.</p>
        {appel.pieces.map((p) => (
          <DepotPiece
            key={p.cle}
            piece={p}
            fichier={fichiers[p.cle] ?? null}
            onFichier={(x) => setFichiers((l) => ({ ...l, [p.cle]: x }))}
            onRetirer={() =>
              setFichiers((l) => {
                const n = { ...l };
                delete n[p.cle];
                return n;
              })
            }
            onErreur={setErreur}
          />
        ))}
      </fieldset>

      <label className="rp-consentement">
        <input type="checkbox" checked={consentement} onChange={(e) => setConsentement(e.target.checked)} required />
        <span>
          J’accepte que {appel.societe.nom} utilise les informations et documents transmis pour étudier ma candidature.
          Ils sont conservés le temps du recrutement et effacés 12 mois après une réponse négative.
        </span>
      </label>

      {erreur && <FieldError>{erreur}</FieldError>}
      <button type="submit" className="btn-primary rp-envoyer" disabled={envoi}>
        {envoi ? (
          'Envoi en cours…'
        ) : (
          <>
            Envoyer ma candidature <Send size={16} aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}

function ChampTexte({
  label,
  requis,
  ...input
}: { label: string; requis?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="rp-champ">
      <span>
        {label}
        {requis && <span className="rp-requis"> *</span>}
      </span>
      <input required={requis} maxLength={input.type === 'email' ? 160 : 80} {...input} />
    </label>
  );
}

// Une pièce demandée : zone de dépôt (clic ou glisser-déposer), puis le
// fichier choisi, à remplacer ou retirer.
function DepotPiece({
  piece,
  fichier,
  onFichier,
  onRetirer,
  onErreur,
}: {
  piece: PieceDemandee;
  fichier: Fichier | null;
  onFichier: (f: Fichier) => void;
  onRetirer: () => void;
  onErreur: (m: string | null) => void;
}) {
  const entree = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const id = `piece-${piece.cle}`;

  async function prendre(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PIECE) return onErreur(`« ${file.name} » dépasse 8 Mo.`);
    try {
      onErreur(null);
      const lu = await lireFichier(file);
      onFichier({ nom: lu.nom, url: lu.url, taille: lu.taille });
    } catch (e) {
      onErreur(e instanceof Error ? e.message : 'Lecture du fichier impossible.');
    }
  }
  function deposer(e: DragEvent) {
    e.preventDefault();
    setSurvol(false);
    void prendre(e.dataTransfer.files[0]);
  }

  return (
    <div className="rp-piece">
      <span className="rp-piece-libelle" id={`${id}-libelle`}>
        {piece.libelle}
        {piece.obligatoire ? <span className="rp-requis"> *</span> : <span className="rp-facultatif"> facultatif</span>}
      </span>
      {fichier ? (
        <div className="rp-fichier">
          <Paperclip size={16} aria-hidden />
          <span className="rp-fichier-nom">
            <strong>{fichier.nom}</strong>
            <span>{taille(fichier.taille)}</span>
          </span>
          <button type="button" className="rp-lien" onClick={() => entree.current?.click()}>
            Remplacer
          </button>
          <button type="button" className="rp-icone" aria-label={`Retirer ${fichier.nom}`} onClick={onRetirer}>
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={`rp-depot${survol ? ' is-survol' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={deposer}
        >
          <FileUp size={20} aria-hidden />
          <span>
            <strong>Choisir un fichier</strong> ou le glisser ici
          </span>
        </label>
      )}
      <input
        ref={entree}
        id={id}
        type="file"
        className="rp-entree-fichier"
        accept={FICHIERS_ACCEPTES.candidature}
        aria-labelledby={`${id}-libelle`}
        onChange={(e) => {
          void prendre(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Confirmation({
  appel,
  reference,
  prenom,
  email,
}: {
  appel: AppelPublic;
  reference: string;
  prenom: string;
  email: string;
}) {
  return (
    <div className="rp-confirmation" role="status">
      <CheckCircle2 size={44} aria-hidden />
      <h2 id="postuler-titre">Merci {prenom} !</h2>
      <p>
        Votre candidature au poste de <strong>{appel.poste}</strong> a bien été envoyée à {appel.societe.nom}.
      </p>
      <p className="rp-reference">
        Référence <strong>{reference}</strong>
      </p>
      <p className="rp-aide">
        Un accusé de réception vous est envoyé à {email}. Si votre profil est retenu, l’équipe vous contactera pour un
        entretien.
      </p>
      <Link href={`/carrieres/${appel.societe.slug}`} className="btn-ghost">
        Voir les autres offres
      </Link>
      <span className="rp-meta">Envoyée le {formatLongDate(todayIso())}</span>
    </div>
  );
}
