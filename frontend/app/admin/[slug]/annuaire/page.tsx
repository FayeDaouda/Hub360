'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Search, UserX } from 'lucide-react';
import { ApiError } from '@/lib/client-api';
import {
  filtrer,
  getAnnuaire,
  membresDeSaCellule,
  nomDe,
  parCellule,
  SANS_CELLULE,
  type Annuaire,
  type CollegueAnnuaire,
  type FiltresAnnuaire,
} from '@/lib/annuaire';
import { ouvrirConversation, ouvrirDirect } from '@/lib/chat';
import { useSessionCourante, useTitrePage } from '@/lib/layout-contexte';
import { CarteCollegue } from '@/components/annuaire/carte-collegue';
import { FicheCollegue } from '@/components/annuaire/fiche-collegue';
import { CloseButton, Drawer } from '@/components/ui/dialog';
import { FieldError } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';

type Props = { params: Promise<{ slug: string }> };
type Vue = 'cartes' | 'liste';
type Tri = 'nom' | 'cellule';

const FILTRES_VIDES: FiltresAnnuaire = { q: '', cellule: '', societe: '', absents: false };

// Annuaire (22/11/2026) : les collègues du périmètre réglé pour la société
// (la société, plus la direction du groupe, ou tout le groupe), en cartes ou
// en liste, triés de A à Z ou par cellule ; recherche instantanée et filtres ;
// la fiche en panneau (feuille sur téléphone). « ?personne=… » l'ouvre
// directement (lien depuis la recherche Ctrl+K ou la messagerie).
export default function AnnuairePage(props: Props) {
  const { slug } = use(props.params);
  useTitrePage('Annuaire');
  const session = useSessionCourante();
  const moiId = session.utilisateur.id;
  const [annuaire, setAnnuaire] = useState<Annuaire | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtres, setFiltres] = useState<FiltresAnnuaire>(FILTRES_VIDES);
  const [vue, setVue] = useState<Vue>('cartes');
  const [tri, setTri] = useState<Tri>('nom');
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    getAnnuaire(slug)
      .then(setAnnuaire)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : 'Annuaire indisponible.'));
  }, [slug]);
  // « ?personne=… » : la fiche ouverte d'emblée (puis retirée de l'adresse).
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('personne');
    if (!id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOuvert(id);
    url.searchParams.delete('personne');
    window.history.replaceState(null, '', url.toString());
  }, []);

  const membres = useMemo(() => annuaire?.membres ?? [], [annuaire]);
  const visibles = useMemo(() => filtrer(membres, filtres), [membres, filtres]);
  const cellules = useMemo(
    () => [...new Set(membres.map((m) => m.cellule ?? SANS_CELLULE))].sort((a, b) => a.localeCompare(b, 'fr')),
    [membres],
  );
  const plusieursSocietes = (annuaire?.societes.length ?? 0) > 1;
  const absents = membres.filter((m) => m.absentJusquau).length;
  const filtresActifs = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES);
  const fiche = membres.find((m) => m.utilisateurId === ouvert) ?? null;

  // Écrire : la conversation privée, ouverte dans la messagerie de la barre du haut.
  async function ecrire(c: CollegueAnnuaire) {
    try {
      const canal = await ouvrirDirect(slug, c.utilisateurId);
      setOuvert(null);
      ouvrirConversation(canal.id);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'La conversation n’a pas pu s’ouvrir.');
    }
  }
  const actions = (c: CollegueAnnuaire) => ({
    onEcrire: c.memeSociete && c.utilisateurId !== moiId ? () => ecrire(c) : undefined,
    agendaHref:
      annuaire?.peutVoirAgendas && c.memeSociete && c.utilisateurId !== moiId
        ? `/admin/${slug}/agenda?collegue=${c.utilisateurId}`
        : null,
  });
  const carte = (c: CollegueAnnuaire) => (
    <CarteCollegue
      key={c.utilisateurId}
      c={c}
      vue={vue}
      moi={c.utilisateurId === moiId}
      avecSociete={plusieursSocietes}
      onOuvrir={() => setOuvert(c.utilisateurId)}
      {...actions(c)}
    />
  );
  const maj = (x: Partial<FiltresAnnuaire>) => setFiltres((f) => ({ ...f, ...x }));

  return (
    <div className="annuaire">
      <div className="annuaire-barre">
        <label className="annuaire-recherche">
          <Search size={18} aria-hidden />
          <input
            type="search"
            placeholder="Nom, poste, cellule, téléphone…"
            aria-label="Rechercher un collègue"
            value={filtres.q}
            onChange={(e) => maj({ q: e.target.value })}
          />
        </label>
        <div className="annuaire-filtres">
          <select
            className="field-input"
            aria-label="Cellule"
            value={filtres.cellule}
            onChange={(e) => maj({ cellule: e.target.value })}
          >
            <option value="">Toutes les cellules</option>
            {cellules.map((c) => (
              <option key={c} value={c}>
                {c === SANS_CELLULE ? 'Sans cellule' : c}
              </option>
            ))}
          </select>
          {plusieursSocietes && (
            <select
              className="field-input"
              aria-label="Société"
              value={filtres.societe}
              onChange={(e) => maj({ societe: e.target.value })}
            >
              <option value="">Toutes les sociétés</option>
              {annuaire!.societes.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nom}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={`annuaire-filtre-absents${filtres.absents ? ' is-actif' : ''}`}
            aria-pressed={filtres.absents}
            onClick={() => maj({ absents: !filtres.absents })}
          >
            <UserX size={16} aria-hidden /> Absents aujourd’hui
            {absents > 0 && <span className="annuaire-compte">{absents}</span>}
          </button>
        </div>
        <div className="annuaire-affichage">
          <div className="vue-toggle" role="radiogroup" aria-label="Tri">
            {(
              [
                ['nom', 'A → Z'],
                ['cellule', 'Par cellule'],
              ] as const
            ).map(([cle, libelle]) => (
              <button
                key={cle}
                type="button"
                role="radio"
                aria-checked={tri === cle}
                className={tri === cle ? 'is-active' : ''}
                onClick={() => setTri(cle)}
              >
                {libelle}
              </button>
            ))}
          </div>
          <div className="vue-toggle annuaire-vue" role="radiogroup" aria-label="Affichage">
            <button
              type="button"
              role="radio"
              aria-checked={vue === 'cartes'}
              aria-label="Cartes"
              title="Cartes"
              className={vue === 'cartes' ? 'is-active' : ''}
              onClick={() => setVue('cartes')}
            >
              <LayoutGrid size={16} aria-hidden />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={vue === 'liste'}
              aria-label="Liste"
              title="Liste"
              className={vue === 'liste' ? 'is-active' : ''}
              onClick={() => setVue('liste')}
            >
              <List size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {erreur && <FieldError>{erreur}</FieldError>}

      {!annuaire && !erreur ? (
        <Skeleton />
      ) : annuaire ? (
        <>
          <p className="annuaire-resume" aria-live="polite">
            {visibles.length} collègue{visibles.length > 1 ? 's' : ''}
            {filtresActifs ? ` sur ${membres.length}` : ''}
            {plusieursSocietes ? ` · ${annuaire.societes.length} sociétés` : ''}
          </p>
          {visibles.length === 0 ? (
            <div className="annuaire-vide">
              <p>Aucun collègue ne correspond à cette recherche.</p>
              {filtresActifs && (
                <button type="button" className="btn-ghost" onClick={() => setFiltres(FILTRES_VIDES)}>
                  Effacer la recherche et les filtres
                </button>
              )}
            </div>
          ) : tri === 'cellule' ? (
            parCellule(visibles).map((g) => (
              <section key={g.cellule} className="annuaire-groupe" aria-label={g.cellule}>
                <h2>
                  {g.cellule === SANS_CELLULE ? 'Sans cellule' : g.cellule}
                  <span className="annuaire-detail">{g.membres.length}</span>
                </h2>
                <ul className={`annuaire-liste annuaire-liste--${vue}`}>{g.membres.map(carte)}</ul>
              </section>
            ))
          ) : (
            <ul className={`annuaire-liste annuaire-liste--${vue}`}>{visibles.map(carte)}</ul>
          )}
        </>
      ) : null}

      {fiche && (
        <Drawer
          onClose={() => setOuvert(null)}
          portal
          labelledBy="annuaire-fiche-titre"
          className="annuaire-panneau"
          trapFocus
        >
          <div className="annuaire-panneau-tete">
            <CloseButton onClick={() => setOuvert(null)} />
          </div>
          <FicheCollegue
            p={{ ...fiche, societe: plusieursSocietes ? fiche.societe : null }}
            titreId="annuaire-fiche-titre"
            moi={fiche.utilisateurId === moiId}
            {...actions(fiche)}
            cellule={membresDeSaCellule(membres, fiche).map((m) => ({
              utilisateurId: m.utilisateurId,
              nom: nomDe(m),
              photoUrl: m.photoUrl,
              estChef: m.estChef,
            }))}
            onOuvrir={setOuvert}
          />
        </Drawer>
      )}
    </div>
  );
}
