'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, UserPlus, Users } from 'lucide-react';
import { plural } from '@hub/domain';
import { Pill } from '@/components/ui/pill';
import { FieldError } from '@/components/ui/field';
import { sectionAccessible } from '@/lib/acces-back-office';
import { useSessionCourante } from '@/lib/layout-contexte';
import { getProjectTeams, setProjectTeams } from './api';
import type { ProjectTeams as Teams } from './types';

type Props = {
  slug: string;
  projectId: string;
  // Écriture sur le module « équipe » (le Dir. GC, l'administration).
  canEdit: boolean;
  // Après une affectation (le dossier du projet relit son en-tête).
  onChange?: () => void;
};

const members = (n: number) => (n === 0 ? 'aucun membre' : plural(n, 'membre'));

// Équipes d'un projet (décision du 29/10/2026) : le Dir. GC les affecte dès
// l'Onboard (fiche du dossier CRM) et les modifie ensuite (dossier projet).
// Le chef de chaque équipe y assigne le travail ; ses membres voient le
// projet. Sans équipe, un bandeau le dit en tête (09/11/2026) : personne ne
// peut encore y travailler. Rien ne s'affiche pour qui ne lit pas les projets.
export function ProjectTeams({ slug, projectId, canEdit, onChange }: Props) {
  const session = useSessionCourante();
  const [teams, setTeams] = useState<Teams | null>(null);
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Focus après un changement d'affichage (clavier, modale de la fiche CRM) :
  // le titre du choix à l'ouverture, le bouton d'origine à la fermeture.
  const actionRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const focusAfter = useRef<'title' | 'action' | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === 'title') titleRef.current?.focus();
    else if (target === 'action') actionRef.current?.focus();
  }, [editing, teams]);

  useEffect(() => {
    let cancelled = false;
    getProjectTeams(slug, projectId)
      .then((t) => !cancelled && setTeams(t))
      .catch(() => !cancelled && setTeams(null));
    return () => {
      cancelled = true;
    };
  }, [slug, projectId]);

  if (!teams) return null;

  function edit() {
    setChosen(teams!.equipes.map((e) => e.id));
    setError(null);
    focusAfter.current = 'title';
    setEditing(true);
  }

  function close() {
    focusAfter.current = 'action';
    setEditing(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setTeams(await setProjectTeams(slug, projectId, chosen));
      close();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'L’affectation a échoué.');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setChosen((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const none = teams.equipes.length === 0;
  // Rien à enregistrer tant que le choix n'a pas changé.
  const unchanged = chosen.length === teams.equipes.length && teams.equipes.every((e) => chosen.includes(e.id));

  return (
    <div className="pt-equipes">
      {none && !editing ? (
        // Sans équipe : bandeau en tête, action principale pour qui affecte.
        <div className="pt-alerte" role="status">
          <span className="pt-alerte-icone" aria-hidden>
            <Users size={18} />
          </span>
          <div className="pt-alerte-texte">
            <p className="pt-alerte-titre">Ce projet n’a pas encore d’équipe</p>
            <p>
              {canEdit
                ? 'Personne ne peut encore y travailler : affectez-le à une équipe. Son chef d’équipe y répartit le travail et ses membres voient le projet.'
                : 'Personne ne peut encore y travailler : le Dir. GC doit l’affecter à une équipe.'}
            </p>
          </div>
          {canEdit && (
            <button ref={actionRef} type="button" className="btn-primary pt-alerte-action" onClick={edit}>
              <UserPlus size={16} aria-hidden /> Affecter une équipe
            </button>
          )}
        </div>
      ) : (
        !editing && (
          <div className="cycle-dossier-tete">
            <span className="field-label">Équipes</span>
            {teams.equipes.map((e) => (
              <Pill key={e.id} tone="neutre" title={e.code}>
                {e.nom} · chef d’équipe {e.chef ?? 'à désigner'}
              </Pill>
            ))}
            {canEdit && (
              <button ref={actionRef} type="button" className="lien-inline" onClick={edit}>
                Modifier
              </button>
            )}
          </div>
        )
      )}

      {editing && (
        <div className="pt-choix">
          <p className="pt-choix-titre" ref={titleRef} tabIndex={-1}>
            {none ? 'Affecter le projet à une équipe' : 'Équipes du projet'}
          </p>
          {teams.disponibles.length ? (
            <>
              <p className="field-aide">
                Chaque chef d’équipe répartit le travail à ses membres ; les membres voient le projet. Plusieurs équipes
                possibles.
              </p>
              <div className="pt-cartes" role="group" aria-label="Cellules">
                {teams.disponibles.map((c) => {
                  const on = chosen.includes(c.id);
                  return (
                    <label key={c.id} className={`pt-carte${on ? ' is-choisie' : ''}`}>
                      <input type="checkbox" checked={on} disabled={busy} onChange={() => toggle(c.id)} />
                      <span className="pt-carte-tete">
                        <span className="pt-carte-nom">{c.nom}</span>
                        <span className="po-code">{c.code}</span>
                        {on && <Check size={15} aria-hidden className="pt-carte-coche" />}
                      </span>
                      <span className="pt-carte-detail">
                        Chef d’équipe {c.chef ?? 'à désigner'} · {members(c.membres)}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="cycle-dossier-actions">
                <button type="button" className="btn-primary" disabled={busy || unchanged} onClick={save}>
                  Enregistrer
                </button>
                <button type="button" className="btn-ghost btn-ghost--sm" disabled={busy} onClick={close}>
                  Annuler
                </button>
              </div>
            </>
          ) : (
            <p className="field-aide">
              Aucune cellule dans cette société : créez-la d’abord
              {sectionAccessible(session, 'equipe') ? (
                <>
                  {' '}
                  dans <Link href={`/admin/${slug}/equipe`}>Équipes</Link>.
                </>
              ) : (
                ' dans Équipes.'
              )}{' '}
              <button type="button" className="lien-inline" onClick={close}>
                Fermer
              </button>
            </p>
          )}
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
