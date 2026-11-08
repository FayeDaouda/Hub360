'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  LoaderCircle,
  Lock,
  LockOpen,
  LogOut,
  Mail,
  Plus,
  Power,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { formatTime, ROLE_EMPLOYEE } from '@hub/domain';
import { ApiError } from '@/lib/client-api';
import { NouveauCompteModal, ResultatInvitation } from '@/components/groupe/nouveau-compte-modal';
import {
  CRITERES_PAR_DEFAUT,
  compterComptes,
  estVerrouille,
  filtrerComptes,
  filtresActifs,
  type CriteresComptes,
  type FiltreStatut,
} from '@/components/groupe/comptes-filtres';
import {
  changerActifCompte,
  couperSessionsCompte,
  debloquerCompte,
  envoyerReinitialisationCompte,
  reinitialiserDoubleFacteur,
  changerRoleCompte,
  comparerRoles,
  getComptesGroupe,
  libelleRole,
  renvoyerInvitation,
} from '@/lib/groupe';
import { etatATraiter, etatEnRetard } from '@/lib/couleurs-etat';
import type {
  CompteGroupe,
  ComptesGroupe,
  InvitationCompte,
  RoleAttribuable,
  SocieteComptes,
  StatutCompteGroupe,
} from '@/lib/types';
import { useConfirmer } from '@/components/confirmation';
import { MenuActions, type ActionMenu } from '@/components/menu-actions';
import { Modal, ModalHeader } from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { KpiStrip, type KpiTile } from '@/components/ui/kpi';
import { PersonAvatar } from '@/components/ui/avatar';
import { Pill, type PillTone } from '@/components/ui/pill';

const STATUT: Record<StatutCompteGroupe, { libelle: string; tone: PillTone }> = {
  actif: { libelle: 'Actif', tone: 'succes' },
  en_attente: { libelle: 'Invitation en attente', tone: 'attention' },
  desactive: { libelle: 'Désactivé', tone: 'neutre' },
};

const LISTE_VIDE: Record<FiltreStatut, string> = {
  tous: 'Aucun compte dans cette société.',
  actif: 'Aucun compte actif.',
  en_attente: 'Aucune invitation en attente.',
  verrouille: 'Aucun compte verrouillé.',
  desactive: 'Aucun compte désactivé.',
};

// Durée d'affichage d'un message de réussite sur la ligne.
const DUREE_MESSAGE_OK = 3000;

type MajCompte = (maj: Partial<CompteGroupe> & { id: string }) => void;

function messageErreur(e: unknown, repli: string): string {
  return e instanceof ApiError ? e.message : repli;
}

const nomComplet = (c: CompteGroupe) => `${c.prenom} ${c.nom}`;

// Comptes & rôles — administration du HUB (CIO, sept. 2026 ; refonte du
// 07/11/2026). Une ligne par personne et par société : son rôle (liste
// regroupée : rôles de la société, rôles transverses), son statut, et ses
// actions dans un menu « ⋯ ». Les tuiles d'en-tête filtrent la liste. Le
// salaire vit dans le dossier RH (D19). Les comptes d'administration et la
// propre ligne de la personne connectée (`moiId`) sont en lecture seule. Le
// serveur refuse aussi (409) le rôle, la désactivation, les sessions et le
// lien de mot de passe, mais PAS encore le retrait de la 2FA, le déblocage ni
// le renvoi d'invitation : cette lecture seule est donc la seule barrière
// pour ces trois-là — ne pas la relâcher.
export function ComptesRolesPanel({ moiId }: { moiId: string }) {
  const [donnees, setDonnees] = useState<ComptesGroupe | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);
  const [societeId, setSocieteId] = useState<string | null>(null);
  const [criteres, setCriteres] = useState<CriteresComptes>(CRITERES_PAR_DEFAUT);
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
        if (!annule)
          setErreur(
            messageErreur(e, 'Les comptes n’ont pas pu être chargés. Vérifiez votre connexion, puis réessayez.'),
          );
      });
    return () => {
      annule = true;
    };
  }, [essai]);

  const societe = donnees?.societes.find((s) => s.id === societeId) ?? null;

  // Remplace un compte après une modification réussie (réponse serveur).
  function majCompte(maj: Partial<CompteGroupe> & { id: string }) {
    setDonnees(
      (d) =>
        d && {
          societes: d.societes.map((s) =>
            s.id !== societeId ? s : { ...s, comptes: s.comptes.map((c) => (c.id === maj.id ? { ...c, ...maj } : c)) },
          ),
        },
    );
  }

  if (erreur) {
    return <ErrorState onRetry={() => setEssai((n) => n + 1)}>{erreur}</ErrorState>;
  }

  if (!donnees) {
    return (
      <section className="groupe-panel glass-panel" aria-busy="true" aria-label="Chargement des comptes">
        <div className="groupe-squelette-tuiles">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton groupe-squelette-tuile" />
          ))}
        </div>
        <div className="groupe-squelette-outils">
          <div className="skeleton" style={{ flex: '1 1 16rem', maxWidth: 380 }} />
          <div className="skeleton" style={{ width: 176 }} />
          <div className="skeleton" style={{ width: 160, marginLeft: 'auto' }} />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton groupe-squelette-ligne" />
        ))}
      </section>
    );
  }

  return (
    <section className="groupe-panel groupe-panel--comptes glass-panel" aria-label="Comptes">
      {donnees.societes.length > 1 && (
        <div className="groupe-onglets" role="tablist" aria-label="Société">
          {donnees.societes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === societeId}
              className={`groupe-onglet${s.id === societeId ? ' est-actif' : ''}`}
              onClick={() => {
                setSocieteId(s.id);
                // Les rôles diffèrent d'une société à l'autre.
                setCriteres((c) => ({ ...c, role: '' }));
              }}
            >
              {s.nom}
              <span className="groupe-onglet-compte">{s.comptes.length}</span>
            </button>
          ))}
        </div>
      )}

      {!societe ? (
        <EmptyState>Aucune société active.</EmptyState>
      ) : (
        <ListeComptes
          key={societe.id}
          societe={societe}
          moiId={moiId}
          criteres={criteres}
          onCriteres={setCriteres}
          onNouveau={() => setNouveau(true)}
          onMaj={majCompte}
        />
      )}

      {nouveau && societe && (
        <NouveauCompteModal societe={societe} onClose={() => setNouveau(false)} onCree={() => setEssai((n) => n + 1)} />
      )}

      <p className="groupe-note">
        <ShieldCheck size={15} aria-hidden />
        Changer un rôle déconnecte la personne : ses nouveaux droits s’appliquent dès sa prochaine connexion.
      </p>
    </section>
  );
}

function ListeComptes({
  societe,
  moiId,
  criteres,
  onCriteres,
  onNouveau,
  onMaj,
}: {
  societe: SocieteComptes;
  moiId: string;
  criteres: CriteresComptes;
  onCriteres: (c: CriteresComptes) => void;
  onNouveau: () => void;
  onMaj: MajCompte;
}) {
  const roles = useMemo(() => [...societe.rolesAttribuables].sort(comparerRoles), [societe.rolesAttribuables]);
  // Filtre par rôle : les rôles réellement portés (administration comprise).
  const rolesPresents = useMemo(
    () =>
      [...new Map(societe.comptes.map((c) => [c.role.nom, { nom: c.role.nom }])).values()]
        .sort(comparerRoles)
        .map((r) => r.nom),
    [societe.comptes],
  );
  // Rôle filtré qui n'est plus porté (son seul titulaire a changé de rôle) :
  // la liste et le filtre reviennent ensemble à « Tous les rôles ».
  const criteresEffectifs = rolesPresents.includes(criteres.role) ? criteres : { ...criteres, role: '' };
  // Comptes modifiés sous un filtre (débloqué, désactivé, rôle changé) : ils
  // restent affichés avec leur message jusqu'au prochain changement de filtre.
  const [gardes, setGardes] = useState<ReadonlySet<string>>(new Set());
  const nombres = compterComptes(societe.comptes);
  const retenus = new Set(filtrerComptes(societe.comptes, criteresEffectifs).map((c) => c.id));
  const comptes = societe.comptes.filter((c) => retenus.has(c.id) || gardes.has(c.id));
  const changerCriteres = (c: CriteresComptes) => {
    setGardes(new Set());
    onCriteres(c);
  };
  const majCriteres = (maj: Partial<CriteresComptes>) => changerCriteres({ ...criteresEffectifs, ...maj });
  const majEtGarder: MajCompte = (maj) => {
    setGardes((g) => new Set(g).add(maj.id));
    onMaj(maj);
  };

  const tuile = (id: FiltreStatut, label: string, icon: KpiTile['icon'], state: KpiTile['state']): KpiTile => ({
    id,
    label,
    value: nombres[id],
    icon,
    state,
    action: {
      type: 'filter',
      active: criteres.statut === id,
      // Second clic sur la tuile active : retour à tous les comptes.
      onClick: () => majCriteres({ statut: criteres.statut === id ? 'tous' : id }),
    },
  });

  return (
    <>
      <KpiStrip
        compact
        tiles={[
          tuile('tous', 'Tous', Users, 'marque'),
          tuile('actif', 'Actifs', UserCheck, 'succes'),
          tuile('en_attente', 'En attente', Mail, etatATraiter(nombres.en_attente)),
          tuile('verrouille', 'Verrouillés', Lock, etatEnRetard(nombres.verrouille)),
          tuile('desactive', 'Désactivés', UserX, 'marque'),
        ]}
      />

      <div className="groupe-outils">
        <label className="champ-recherche groupe-recherche">
          <Search size={16} aria-hidden />
          <input
            type="search"
            className="field-input"
            placeholder="Nom, e-mail ou rôle…"
            aria-label="Rechercher un compte"
            value={criteres.recherche}
            onChange={(e) => majCriteres({ recherche: e.target.value })}
          />
        </label>
        <select
          className="field-input groupe-filtre-role"
          aria-label="Filtrer par rôle"
          value={criteresEffectifs.role}
          onChange={(e) => majCriteres({ role: e.target.value })}
        >
          <option value="">Tous les rôles</option>
          {rolesPresents.map((r) => (
            <option key={r} value={r}>
              {libelleRole(r)}
            </option>
          ))}
        </select>
        <span className="groupe-compteur" role="status" aria-live="polite">
          {comptes.length === societe.comptes.length
            ? `${comptes.length} compte${comptes.length > 1 ? 's' : ''}`
            : `${comptes.length} compte${comptes.length > 1 ? 's' : ''} sur ${societe.comptes.length}`}
        </span>
        <button type="button" className="btn-primary groupe-nouveau" onClick={onNouveau}>
          <Plus size={15} aria-hidden /> Nouveau compte
        </button>
      </div>

      {comptes.length === 0 ? (
        <div className="groupe-vide">
          <EmptyState>
            {criteresEffectifs.recherche.trim() || criteresEffectifs.role
              ? 'Aucun compte ne correspond à ces critères.'
              : LISTE_VIDE[criteresEffectifs.statut]}
          </EmptyState>
          {filtresActifs(criteresEffectifs) && (
            <button
              type="button"
              className="btn-ghost btn-ghost--sm"
              onClick={() => changerCriteres(CRITERES_PAR_DEFAUT)}
            >
              Effacer les filtres
            </button>
          )}
        </div>
      ) : (
        <table className="groupe-table">
          <thead>
            <tr>
              <th scope="col">Personne</th>
              <th scope="col">Rôle</th>
              <th scope="col">Statut</th>
              <th scope="col" className="groupe-col-actions">
                <span className="sr-only">Actions</span>
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
                onMaj={majEtGarder}
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
  onMaj: MajCompte;
}) {
  const lectureSeule = compte.administration || estMoi;
  const { actions, retour, modale } = useActionsCompte(compte, lectureSeule, onMaj);
  const statut = STATUT[compte.statut];

  return (
    <tr>
      <td data-libelle="Personne">
        <div className="groupe-personne">
          <PersonAvatar name={nomComplet(compte)} colorKey={compte.id} size="md" />
          <span className="groupe-personne-texte">
            <strong>
              {nomComplet(compte)}
              {estMoi && <span className="groupe-moi">Vous</span>}
            </strong>
            <span className="groupe-email">{compte.email}</span>
          </span>
        </div>
      </td>
      <td data-libelle="Rôle">
        {lectureSeule ? (
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
      <td data-libelle="Statut">
        <div className="groupe-statuts">
          <Pill tone={statut.tone}>{statut.libelle}</Pill>
          {compte.doubleFacteur && (
            <Pill tone="info" title="Double authentification active">
              2FA
            </Pill>
          )}
          {estVerrouille(compte) && (
            <Pill
              tone="risque"
              title={`Trop d’essais de connexion — verrouillé jusqu’à ${formatTime(compte.verrouilleJusquau)}`}
            >
              Verrouillé
            </Pill>
          )}
        </div>
        {retour}
      </td>
      <td className="groupe-col-actions">
        <MenuActions
          variante="icone"
          alignement="droite"
          libelle={`Actions pour ${nomComplet(compte)}`}
          actions={actions}
        />
        {modale}
      </td>
    </tr>
  );
}

type EtatAction =
  { type: 'repos' } | { type: 'envoi' } | { type: 'ok'; message: string } | { type: 'erreur'; message: string };

// Actions d'un compte (menu « ⋯ ») : invitation à renvoyer (en attente),
// désactivation (coupe les sessions) ou réactivation ; pour un compte actif,
// couper ses sessions ou lui envoyer un lien de nouveau mot de passe ; retrait
// de la double authentification ; déblocage après trop d'essais. Jamais sur
// soi-même ni sur un compte d'administration.
function useActionsCompte(
  compte: CompteGroupe,
  lectureSeule: boolean,
  onMaj: MajCompte,
): { actions: ActionMenu[]; retour: ReactNode; modale: ReactNode } {
  const confirmer = useConfirmer();
  const [etat, setEtat] = useState<EtatAction>({ type: 'repos' });
  const [invitation, setInvitation] = useState<InvitationCompte | null>(null);
  const nom = nomComplet(compte);

  useEffect(() => {
    if (etat.type !== 'ok') return;
    const t = setTimeout(() => setEtat({ type: 'repos' }), DUREE_MESSAGE_OK);
    return () => clearTimeout(t);
  }, [etat]);

  async function executer(action: () => Promise<unknown>, ok: string) {
    setEtat({ type: 'envoi' });
    try {
      await action();
      setEtat({ type: 'ok', message: ok });
    } catch (e) {
      setEtat({
        type: 'erreur',
        message: messageErreur(e, 'L’action n’a pas abouti. Vérifiez votre connexion, puis réessayez.'),
      });
    }
  }

  if (lectureSeule) return { actions: [], retour: null, modale: null };

  const busy = etat.type === 'envoi';
  const actions: ActionMenu[] = [];

  if (compte.statut === 'en_attente') {
    actions.push({
      cle: 'invitation',
      libelle: 'Renvoyer l’invitation',
      icone: Send,
      onClick: () => executer(async () => setInvitation(await renvoyerInvitation(compte.id)), 'Invitation renvoyée'),
    });
  }
  if (compte.statut === 'actif') {
    actions.push(
      {
        cle: 'mot-de-passe',
        libelle: 'Envoyer un lien de mot de passe',
        icone: Mail,
        onClick: async () => {
          const ok = await confirmer({
            titre: `Envoyer un lien de nouveau mot de passe à ${nom} ?`,
            message: `Un e-mail part à ${compte.email}. Son mot de passe actuel reste valable tant que le lien n’est pas utilisé.`,
            confirmer: 'Envoyer le lien',
          });
          if (ok) await executer(() => envoyerReinitialisationCompte(compte.id), 'Lien envoyé');
        },
      },
      {
        cle: 'sessions',
        libelle: 'Couper les sessions',
        icone: LogOut,
        onClick: async () => {
          const ok = await confirmer({
            titre: `Couper les sessions de ${nom} ?`,
            message:
              'Cette personne est déconnectée de tous ses appareils et devra se reconnecter. Rien d’autre ne change.',
            confirmer: 'Couper les sessions',
            danger: true,
          });
          if (ok) await executer(() => couperSessionsCompte(compte.id), 'Sessions coupées');
        },
      },
    );
  }
  if (compte.doubleFacteur) {
    actions.push({
      cle: 'double-facteur',
      libelle: 'Réinitialiser la double authentification',
      icone: Smartphone,
      onClick: async () => {
        const ok = await confirmer({
          titre: `Retirer la double authentification de ${nom} ?`,
          message:
            'Téléphone perdu ou changé : ses sessions sont coupées, et la double authentification lui sera redemandée à sa prochaine connexion.',
          confirmer: 'Retirer',
          danger: true,
        });
        if (ok)
          await executer(
            async () => onMaj(await reinitialiserDoubleFacteur(compte.id)),
            'Double authentification retirée',
          );
      },
    });
  }
  // Verrouillé après trop d'essais (lot C) : sans confirmation, le déblocage
  // ne fait que rendre l'accès plus tôt.
  if (estVerrouille(compte)) {
    actions.push({
      cle: 'debloquer',
      libelle: `Débloquer maintenant (verrouillé jusqu’à ${formatTime(compte.verrouilleJusquau)})`,
      icone: LockOpen,
      onClick: () => executer(async () => onMaj(await debloquerCompte(compte.id)), 'Compte débloqué'),
    });
  }
  if (compte.statut === 'actif') {
    actions.push({
      cle: 'desactiver',
      libelle: 'Désactiver le compte',
      icone: Power,
      danger: true,
      separee: true,
      onClick: async () => {
        const ok = await confirmer({
          titre: `Désactiver le compte de ${nom} ?`,
          message:
            'Cette personne ne pourra plus se connecter et ses sessions sont coupées tout de suite. Vous pourrez réactiver le compte à tout moment.',
          confirmer: 'Désactiver',
          danger: true,
        });
        if (ok) await executer(async () => onMaj(await changerActifCompte(compte.id, false)), 'Compte désactivé');
      },
    });
  }
  if (compte.statut === 'desactive') {
    actions.push({
      cle: 'reactiver',
      libelle: 'Réactiver le compte',
      icone: Power,
      onClick: () => executer(async () => onMaj(await changerActifCompte(compte.id, true)), 'Compte réactivé'),
    });
  }

  return {
    actions: actions.map((a) => ({ ...a, desactive: busy })),
    retour: etat.type === 'repos' ? null : <EtatLigne etat={etat} />,
    modale: invitation && (
      <Modal onClose={() => setInvitation(null)} closeOnEscape={false} portal className="modal--sm" label="Invitation">
        <ModalHeader title="Invitation renvoyée" onClose={() => setInvitation(null)} />
        <div className="modal-body">
          <ResultatInvitation {...invitation} nom={nom} email={compte.email} onClose={() => setInvitation(null)} />
        </div>
      </Modal>
    ),
  };
}

function SelectRole({
  compte,
  societe,
  roles,
  onMaj,
}: {
  compte: CompteGroupe;
  societe: SocieteComptes;
  roles: RoleAttribuable[];
  onMaj: MajCompte;
}) {
  const confirmer = useConfirmer();
  const [etat, setEtat] = useState<EtatAction>({ type: 'repos' });
  const propres = roles.filter((r) => !r.transverse);
  const transverses = roles.filter((r) => r.transverse);

  useEffect(() => {
    if (etat.type !== 'ok') return;
    const t = setTimeout(() => setEtat({ type: 'repos' }), DUREE_MESSAGE_OK);
    return () => clearTimeout(t);
  }, [etat]);

  // Changer de rôle déconnecte la personne et change ses droits : on confirme
  // (décision du 08/11/2026). Annuler laisse l'ancien rôle (liste contrôlée).
  // En rouge quand le nouveau rôle ouvre plus que l'espace d'un salarié.
  async function changer(roleId: string) {
    if (roleId === compte.role.id) return;
    const nouveau = roles.find((r) => r.id === roleId);
    if (!nouveau) return;
    const ok = await confirmer({
      titre: `Passer ${nomComplet(compte)} de ${libelleRole(compte.role.nom)} à ${libelleRole(nouveau.nom)} ?`,
      message:
        'Cette personne est déconnectée tout de suite et retrouvera ses nouveaux droits à sa prochaine connexion.',
      confirmer: 'Changer le rôle',
      danger: nouveau.transverse || nouveau.nom !== ROLE_EMPLOYEE,
    });
    if (!ok) return;
    setEtat({ type: 'envoi' });
    try {
      const maj = await changerRoleCompte(compte.id, societe.id, roleId);
      onMaj(maj);
      setEtat({ type: 'ok', message: 'Rôle mis à jour' });
    } catch (e) {
      setEtat({ type: 'erreur', message: messageErreur(e, 'Rôle non modifié — réessayez.') });
    }
  }

  return (
    <div className="groupe-cellule-action">
      <select
        className="groupe-role-select"
        aria-label={`Rôle de ${nomComplet(compte)}`}
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
      <EtatLigne etat={etat} />
    </div>
  );
}

function EtatLigne({ etat }: { etat: EtatAction }) {
  return (
    <span className={`groupe-etat groupe-etat--${etat.type}`} role="status" aria-live="polite">
      {etat.type === 'envoi' && <LoaderCircle size={13} className="groupe-etat-roue" aria-hidden />}
      {etat.type === 'ok' && (
        <>
          <Check size={13} aria-hidden /> {etat.message}
        </>
      )}
      {etat.type === 'erreur' && etat.message}
    </span>
  );
}
