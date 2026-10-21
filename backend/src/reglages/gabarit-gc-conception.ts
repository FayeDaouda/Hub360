import type { CarteGabarit, ContenuGabarit, TacheGabarit, Temps } from './gabarit';

// Gabarit GC-CONCEPTION · bêta 1.0 — transcrit à l'identique des captures de
// la page « Réglages · HUB 360° » conçue par le boss (29/09/2026), complété
// des textes de sa maquette « Projets » (01/10/2026) : descriptifs, étiquettes,
// ouvertures conditionnelles, liste des équipements. Aucune valeur ajoutée ni
// déduite : une fenêtre ou un temps absent des maquettes est absent ici. À
// relire contre la spécification source dès qu'elle est transmise (elle cite
// des règles comme « R1 »).

const h = (heures: number): Temps => ({ type: 'heures', heures });
const SANS: Temps = { type: 'sans' };
const PARTAGE: Temps = { type: 'partage', libelle: 'commandes ETB, ETL et BC : 8 h partagées', heures: 8 };
const PART: Temps = { type: 'part_carte' };
const CLIENT_HORS_BUDGET = 'Hors budget atelier. Tout dépassement est qualifié CLIENT';
const contenu = (...lignes: string[]) => ['Contenu attendu :', ...lignes.map((l) => `· ${l}`)].join('\n');
const equipement = (cle: string, libelle: string): TacheGabarit => ({ cle, libelle, temps: PART, sourceNative: true });
const J = (debut: number, fin: number) => ({ debut, fin });
const t = (cle: string, libelle: string, temps: Temps, fenetre?: { debut: number; fin: number }): TacheGabarit =>
  fenetre ? { cle, libelle, fenetre, temps } : { cle, libelle, temps };
const pv: TacheGabarit = t('pv_client', 'PV ou bon pour accord du client', SANS);

// Circuit d'une étude confiée à un bureau d'études (ETS, ETB).
function etude(cle: string, libelle: string, f: number[], commande: Temps, verification: number): CarteGabarit {
  const [c0, c1, o0, o1, co, tr, r0, r1, v0, v1, b0, b1] = f;
  return {
    cle,
    libelle,
    fenetre: J(c0, c1),
    taches: [
      t('offre', 'Offre du BET', SANS, J(o0, o1)),
      t('commande', 'Commande au BET', commande, J(co, co)),
      t('transmission', 'Transmission des données au BET', SANS, J(tr, tr)),
      t('reception', "Réception de l'étude", SANS, J(r0, r1)),
      t('verification', 'Vérification par la team', h(verification), J(v0, v1)),
      t('visa', "Visa BC et validation de l'étude", SANS, J(b0, b1)),
    ],
  };
}

const sousLot = (cle: string, libelle: string) => t(cle, `Sous-lot ${libelle} · visa BC et validation`, SANS, J(33, 35));

export const GABARIT_GC_CONCEPTION: ContenuGabarit = {
  etapes: [
    {
      numero: 1,
      cle: 'onboard',
      libelle: 'Onboard',
      cartes: [
        {
          cle: 'documents_client',
          libelle: 'Documents du client',
          note: 'délai en heures ouvrées depuis J1',
          descriptif:
            "Pièces déposées par l'Architecte DPLG, lisibles et téléchargeables par l'espace dessin. Le dépôt vaut validation : exception écrite au principe 4 (pièce administrative, pas un livrable).",
          fenetre: J(1, 5),
          taches: [
            { ...t('piece_identite', "Pièce d'identité", SANS), descriptif: '· Copie passeport ou CNI' },
            t('ninea', 'NINEA', SANS),
            t('plan_cadastral', 'Plan cadastral', SANS),
            t('droit_reel', 'Droit réel', SANS),
            t('expertise', "Rapport d'expertise immobilière", SANS),
          ],
        },
        {
          cle: 'releves_existants',
          libelle: 'Relevés existants',
          note: '24 h calendaires après la visite : réglé par le prompt (R1)',
          descriptif: 'Visite du site : chaque relevé est renseigné dans les 24 h calendaires qui suivent la visite, week-end compris.',
          taches: [
            t('assainissement', 'Assainissement', SANS),
            t('eau', 'Eau', SANS),
            t('electricite', 'Électricité', SANS),
            t('telephone', 'Téléphone', SANS),
            t('plans_existants', 'Plans existants', SANS),
            t('releve_geometre', 'Relevé géomètre', SANS),
          ],
        },
      ],
    },
    {
      numero: 2,
      cle: 'avant_projet',
      libelle: 'Avant-projet',
      cartes: [
        {
          cle: 'programme',
          libelle: 'Programme',
          descriptif: 'Programme copié du devis signé, en lecture seule.',
          taches: [t('analyse_programme', 'Analyse et confirmation du programme', h(8), J(1, 1))],
        },
        {
          cle: 'livrables',
          libelle: 'Livrables',
          descriptif: "Détails façade et Mood board à rendre au plus tard à J13 : la carte Façades s'ouvre à J14 (arbitrage du 23/09).",
          fenetre: J(2, 15),
          taches: [
            t('esquisses', 'Esquisses', h(40)),
            t('plans_aps', 'Plans APS (axes, cotations, surfaces)', h(40)),
            t('coupes', 'Coupes', h(16)),
            t('details_cuisines', 'Détails cuisines', h(16)),
            t('details_sdb', 'Détails SDB', h(16)),
            t('details_escaliers', 'Détails escaliers', h(8)),
            t('details_facade', 'Détails façade', h(16), J(2, 13)),
            t('mood_board', 'Mood board', h(16), J(2, 13)),
          ],
        },
        {
          cle: 'validation_avp',
          libelle: "Validation client de l'avant-projet",
          client: true,
          descriptif: `${CLIENT_HORS_BUDGET} (arbitrage du 23/09 · ISO 9001 §8.3.4).`,
          fenetre: J(16, 18),
          taches: [pv],
        },
        {
          cle: 'sources_avp',
          libelle: 'Sources',
          fichiers: true,
          descriptif: 'Fichiers natifs rangés par rubrique : Plans (AutoCAD, ArchiCAD, Revit) · Modélisation (SketchUp) · Rendus (B-render, Corona).',
          taches: [],
        },
      ],
    },
    {
      numero: 3,
      cle: 'images',
      libelle: 'Images',
      cartes: [
        {
          cle: 'facades',
          libelle: 'Façades',
          etiquette: 'Inclus au CO',
          descriptif: 'Validation vue par vue. Zooms libres, inclus.',
          ouvreApres: ['livrables.details_facade'],
          fenetre: J(14, 18),
          taches: [
            t('facade_principale', 'Façade principale', h(8)),
            t('laterale_gauche', 'Latérale gauche', h(8)),
            t('laterale_droite', 'Latérale droite', h(8)),
            t('plongee', 'Plongée', h(8)),
            t('contre_plongee', 'Contre-plongée', h(8)),
          ],
        },
        {
          cle: 'interieurs',
          libelle: 'Intérieurs',
          etiquette: 'IM par pièce',
          descriptif: "Hauteur d'œil ; matériaux et ambiance du mood board et de la gamme ; lumière naturelle cohérente avec l'orientation réelle.",
          ouvreApres: ['livrables.details_cuisines', 'livrables.details_sdb'],
          fenetre: J(16, 22),
          temps: { type: 'par_unite', heures: 8, unite: 'pièce' },
          taches: [],
        },
        {
          cle: 'vues_detail',
          libelle: 'Vues de détail',
          etiquette: 'Par vue',
          descriptif: 'Vues créées depuis le devis.',
          fenetre: J(21, 23),
          temps: { type: 'par_unite', heures: 8, unite: 'vue' },
          taches: [],
        },
        {
          cle: 'validation_images',
          libelle: 'Validation client des images',
          client: true,
          descriptif: `${CLIENT_HORS_BUDGET}.`,
          fenetre: J(24, 26),
          taches: [pv],
        },
      ],
    },
    {
      numero: 4,
      cle: 'autorisations',
      libelle: 'Autorisations',
      cartes: [
        {
          cle: 'permis_demolir',
          libelle: 'Permis de démolir',
          desactivee: true,
          motifDesactivation: 'Procédure à compléter · désactivée par défaut',
          descriptif: 'Procédure à compléter (point ouvert n° 1) : carte vide, désactivée par défaut.',
          taches: [],
        },
        {
          cle: 'permis_construire',
          libelle: 'Permis de construire',
          descriptif:
            "Dossier de dépôt si DPC au devis ; instruction si SPC. Désactivable avec le motif « Dépôt assuré par le client » : le délai GC tombe et l'instruction n'est pas comptée.",
          fenetre: J(16, 21),
          taches: [
            t('contacts', 'E-mail · N° de téléphone', SANS),
            t('pieces_foncieres', 'Droit réel · Plan cadastral · ID · NINEA', SANS),
            // Visa DPLG : le dépôt attend les plans visés (revue Dir. GC, 21/10/2026).
            { ...t('plans_autorisation', 'Plans · Coupes · Façades (cartouche autorisation)', h(24)), visaDplg: true },
            t('fiches_techniques', 'Fiches techniques', h(8)),
            t('notice_securite', 'Notice de sécurité', { type: 'charge_gc', charge: 'notice' }),
            t('cachet_architecte', "Cachet de l'architecte", { type: 'charge_gc', charge: 'cachet' }),
            t('timbre_fiscal', 'Timbre fiscal', { type: 'charge_gc', charge: 'timbre' }),
            t('depot', 'Dépôt', h(4)),
            t('autorisation', 'Autorisation de construire', SANS),
          ],
        },
      ],
    },
    {
      numero: 5,
      cle: 'etudes',
      libelle: 'Études',
      cartes: [
        etude('ets', 'Étude de sol (ETS)', [1, 15, 1, 3, 3, 3, 3, 12, 13, 13, 14, 15], h(4), 8),
        etude('etb', 'Étude béton armé (ETB)', [13, 29, 13, 16, 16, 16, 16, 25, 26, 26, 27, 29], PARTAGE, 8),
        {
          cle: 'etl',
          libelle: 'Lots techniques (ETL)',
          fenetre: J(13, 35),
          taches: [
            t('offre', 'Offre du BET', SANS, J(13, 16)),
            t('commande', 'Commande au BET', PARTAGE, J(16, 16)),
            t('transmission', 'Transmission des données au BET', SANS, J(16, 16)),
            t('reception', "Réception de l'étude", SANS, J(16, 30)),
            t('verification', 'Vérification par la team', h(16), J(31, 32)),
            sousLot('elec_cfo', 'Électricité courants forts'),
            sousLot('elec_cfa', 'Électricité courants faibles'),
            sousLot('plomberie_alim', 'Plomberie alimentation'),
            sousLot('plomberie_evac', 'Plomberie évacuation'),
            sousLot('clim_ventilation', 'Climatisation et ventilation'),
            sousLot('securite_incendie', 'Sécurité incendie'),
          ],
        },
        {
          cle: 'bureau_controle',
          libelle: 'Bureau de contrôle',
          descriptif: 'Mission unique pour toutes les études, y compris celles fournies par le client.',
          fenetre: J(13, 16),
          taches: [
            { ...t('offre', 'Offre du bureau de contrôle', SANS, J(13, 16)), descriptif: 'Mission unique pour toutes les études, y compris celles fournies par le client.' },
            t('commande', 'Commande au bureau de contrôle', PARTAGE, J(16, 16)),
          ],
        },
      ],
    },
    {
      numero: 6,
      cle: 'plans_execution',
      libelle: "Plans d'exécution",
      cartes: [
        {
          cle: 'pe_architecture',
          libelle: "Plans d'exécution architecture",
          fenetre: J(22, 31),
          taches: [
            {
              ...t('pe_architecture', "Plans d'exécution architecture", h(80)),
              sourceNative: true,
              visaDplg: true,
              descriptif: contenu('Niveaux au 1/50', "Coupes d'exécution", "Façades d'exécution", 'Toiture', 'Repérage', 'Réservations'),
            },
          ],
        },
        { cle: 'schemas_principe', libelle: 'Schémas de principe', fenetre: J(27, 31), taches: [t('schemas_principe', 'Schémas de principe', h(40))] },
        { cle: 'cahier_menuiserie', libelle: 'Cahier de menuiserie', fenetre: J(32, 34), taches: [t('cahier_menuiserie', 'Cahier de menuiserie', h(24))] },
        { cle: 'revetements', libelle: 'Revêtements', fenetre: J(32, 34), taches: [t('revetements', 'Revêtements', h(24))] },
        {
          cle: 'equipements',
          libelle: 'Équipements',
          descriptif: 'Générés depuis le programme et le standing : ce qui est absent du programme passe en Non nécessaire.',
          fenetre: J(35, 37),
          temps: { type: 'total', heures: 24 },
          taches: [
            equipement('sanitaires', 'Sanitaires'),
            equipement('cuisines', 'Cuisines'),
            equipement('groupe_electrogene', 'Groupe électrogène'),
            equipement('piscine', 'Piscine'),
            equipement('ascenseur', 'Ascenseur'),
            equipement('pmr', 'Accessibilité PMR'),
            equipement('plomberie', 'Plomberie : pompe surpresseur, bâche à eau, chauffe-eau'),
            equipement('electricite', 'Électricité : prises, interrupteurs, luminaires'),
            equipement(
              'domotique',
              "Domotique : vidéosurveillance, contrôle d'accès, alarme, réseau, éclairage piloté, ouvrants motorisés, clim pilotée, détection fumée et fuite, sonorisation, centrale",
            ),
          ],
        },
        {
          cle: 'amenagements',
          libelle: 'Aménagements',
          fenetre: J(35, 36),
          taches: [{ ...t('amenagements', 'Aménagements', h(16)), descriptif: contenu('Paysage', 'Mobilier') }],
        },
        { cle: 'sources_pe', libelle: 'Sources', fichiers: true, descriptif: "Fichiers natifs de l'étape, par rubrique.", taches: [] },
        {
          cle: 'tache_finale',
          libelle: 'Tâche finale',
          fenetre: J(38, 40),
          taches: [{ ...t('integration_livraison', 'Intégration des études visées, mises à jour, contrôle DPLG, livraison', h(24)), visaDplg: true }],
        },
      ],
    },
  ],
};
