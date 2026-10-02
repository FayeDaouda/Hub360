// Conditions générales de vente jointes aux offres (Annexe 2, maquette
// Finances, oct. 2026). Texte RÉEL, repris du document de la société
// (« CGV_Grey_Concrete_2026.pdf », édition 2026) — à remplacer par la nouvelle
// édition quand elle paraît, jamais réécrit ici.

export type ArticleCgv = { numero: number; titre: string; paragraphes: string[] };
export type Cgv = { edition: string; articles: ArticleCgv[] };

const GREY_CONCRETE: Cgv = {
  edition: '2026',
  articles: [
    {
      numero: 1,
      titre: 'Objet',
      paragraphes: [
        'Les présentes conditions générales définissent les règles et modalités relatives aux services de conception fournis par Grey Concrete dans le cadre de ses projets immobiliers.',
      ],
    },
    {
      numero: 2,
      titre: 'Champ d’application',
      paragraphes: [
        'Les présentes conditions s’appliquent à toutes les prestations de conception, y compris les services d’architecture, d’ingénierie, de design d’intérieur et de modélisation proposés par Grey Concrete.',
      ],
    },
    {
      numero: 3,
      titre: 'Phases de conception',
      paragraphes: [
        'Le processus de conception se déroule en plusieurs phases distinctes :',
        'Phase préliminaire — Prise de contact et analyse des besoins du client, du site et des contraintes réglementaires.',
        'Avant-projet sommaire (APS) — Présentation des premières esquisses et proposition des concepts initiaux.',
        'Avant-projet détaillé (APD) — Développement détaillé des plans en fonction des retours clients, ajustement des coûts et des matériaux.',
        'Phase d’exécution — Finalisation des plans techniques et dépôt des documents pour obtention des autorisations de construction.',
        'Suivi de chantier — Assistance durant la phase de construction pour assurer la conformité des travaux aux plans (prestation optionnelle).',
      ],
    },
    {
      numero: 4,
      titre: 'Tarification',
      paragraphes: [
        'La tarification des services de conception repose sur deux paramètres : la surface totale à concevoir (en m²) et le nombre de planches. Une planche désigne une page de dessin, soit un plan-type à concevoir ; elle se distingue du nombre d’étages : le nombre de planches correspond au nombre de niveaux distincts à concevoir. Des niveaux identiques ne constituent qu’une seule planche.',
        'Le montant de conception est obtenu selon la formule : tarif de la catégorie × surface (m²) × nombre de planches.',
        'La catégorie est déterminée par le niveau de complexité et de spécialisation technique requis : plus le projet nécessite de recherche ou de spécialisation, plus il relève d’une catégorie supérieure.',
        'CO1 — 5 000 F/m² pour les projets à faible complexité.',
        'CO2 — 7 000 F/m² pour les projets de complexité intermédiaire.',
        'CO3 — 10 000 F/m² pour les projets complexes à exigences spécifiques.',
        'Les livrables sont identiques pour les trois catégories : plans APS, plans d’exécution tous corps d’état, dossier de permis de construire, ainsi que les rendus 3D des façades (rendus extérieurs). Seul le niveau de complexité distingue les catégories.',
        'Ne sont pas compris dans le prix de conception : les études techniques (sol, structure, lots techniques), le bureau de contrôle, les prestations de dépôt et de suivi du permis, ainsi que les frais et taxes afférents au dépôt et à l’obtention du permis de construire. Ces éléments font l’objet des articles 5 et 6 ci-après.',
        'Images intérieures (IM), facturées en supplément à la pièce (les rendus extérieurs étant inclus dans la conception) :',
        'IM1 — rendus générés par IA, exactitude des pièces, sans détail d’aménagement fourni : 50 000 F/pièce.',
        'IM2 — design et rendus en atelier, recherche matériaux et mobilier, livré en moodboard : 100 000 F/pièce.',
        'IM3 — recherche spécifique, aménagement sur-mesure, détails et moodboard fournis : 150 000 F/pièce.',
        'Suivi de chantier (SU), forfait mensuel dont la catégorie découle de la catégorie de conception (CO1 = SU1, CO2 = SU2, CO3 = SU3) : SU1 : 300 000 F/mois · SU2 : 500 000 F/mois · SU3 : 1 000 000 F/mois.',
        'Extras : suivi BIM 100 000 F/mois ; caméra de surveillance 100 000 F/mois, en sus de la facturation des caméras.',
        'Tous les prix sont exprimés en francs CFA, hors taxes. La TVA au taux en vigueur (18 %) s’ajoute au montant HT.',
      ],
    },
    {
      numero: 5,
      titre: 'Études techniques et refacturation',
      paragraphes: [
        'Les études techniques et l’intervention du bureau de contrôle ne sont pas comprises dans les prestations de conception. Elles sont réalisées par des bureaux d’étude spécialisés, sélectionnés et coordonnés par Grey Concrete :',
        'ETS — étude de sol (étude géotechnique du terrain).',
        'ETB — étude béton armé (structure et dimensionnement).',
        'ETL — études des lots techniques (électricité, plomberie, réseaux).',
        'Sur demande du client, Grey Concrete assure l’avance et la gestion de ces prestations : elle règle les bureaux d’étude concernés et refacture ces montants au client, majorés de frais de coordination de 10 %. Ces frais rémunèrent la sélection des intervenants, la coordination des études et leur superposition avec les plans architecturaux, incluant la validation du passage des réseaux. Ces refacturations figurent sur lignes distinctes de la facture, identifiées par leur nature.',
        'Le règlement des intervenants par Grey Concrete intervient après encaissement des sommes correspondantes auprès du client. Grey Concrete agit à ce titre en qualité d’intermédiaire ; sa responsabilité se limite à la sélection, à la coordination et à la transmission des livrables d’étude, à l’exclusion du contenu technique des études elles-mêmes, qui relève de la responsabilité des bureaux qui les réalisent.',
      ],
    },
    {
      numero: 6,
      titre: 'Permis de construire',
      paragraphes: [
        'Grey Concrete s’engage à remettre au client un dossier de permis de construire complet et en bonne et due forme. Par défaut, le dépôt du dossier auprès des autorités compétentes ainsi que tous les faits relatifs à ce dépôt (instruction, délais, demandes de pièces complémentaires, décision d’autorisation ou de refus) relèvent de la seule responsabilité du client.',
        'Sur demande, Grey Concrete propose deux prestations distinctes, facturées au forfait établi selon la taille du projet, en deux décomptes de 50 % (avance à la commande, solde à la livraison du livrable) :',
        'DPC — Dépôt de permis de construire : constitution du dossier de dépôt (plans adaptés et conformes aux normes de dépôt, cachet de l’architecte, notice de sécurité, fiche technique) et dépôt auprès de l’urbanisme. Livrable : récépissé de dépôt.',
        'SPC — Suivi de permis de construire : suivi et compte-rendu de chaque étape de l’instruction, avec intervention à chaque niveau. Livrable : plans autorisés et arrêté d’autorisation.',
        'Le solde n’est dû qu’à la remise du livrable correspondant, garantissant l’alignement des intérêts entre Grey Concrete et le client sur la célérité de la démarche. Les frais, taxes et règlements dus aux autorités et à la mairie dans le cadre de ces démarches restent, dans tous les cas, à la charge du client.',
      ],
    },
    {
      numero: 7,
      titre: 'Modalités de paiement',
      paragraphes: [
        'Les paiements des prestations de conception sont effectués en plusieurs étapes :',
        'Acompte initial de 40 % à la signature du contrat.',
        'Paiement intermédiaire de 40 % à la fin de l’APD.',
        'Solde final de 20 % à la livraison des plans d’exécution.',
        'Les prestations DPC et SPC suivent leur propre échéancier (50 % / 50 %) tel que défini à l’article 6.',
      ],
    },
    {
      numero: 8,
      titre: 'Modifications et travaux supplémentaires (TS)',
      paragraphes: [
        'Toute modification demandée après la validation des phases APS ou APD fait l’objet d’un avenant et constitue un travail supplémentaire facturé en sus :',
        'Reprise majeure entraînant un nouveau plan-type (nouvelle planche) : facturée au tarif de la catégorie souscrite × surface × nombre de planches concernées.',
        'Reprise mineure sans changement de plan-type : forfait de 100 000 F par reprise.',
        'Image intérieure supplémentaire hors périmètre : selon le niveau retenu (IM1 50 000 / IM2 100 000 / IM3 150 000 F la pièce).',
        'Tout travail supplémentaire fait l’objet d’un devis complémentaire accepté par écrit avant exécution.',
      ],
    },
    {
      numero: 9,
      titre: 'Propriété intellectuelle',
      paragraphes: [
        'Les documents, plans et esquisses produits dans le cadre des services de conception restent la propriété de Grey Concrete jusqu’au règlement complet des factures dues par le client. Toute reproduction ou exploitation non autorisée est interdite sans l’accord écrit préalable de Grey Concrete.',
      ],
    },
    {
      numero: 10,
      titre: 'Responsabilité et force majeure',
      paragraphes: [
        'Grey Concrete s’engage à réaliser ses prestations conformément aux normes et réglementations en vigueur ainsi qu’aux règles de l’art. Sa responsabilité ne saurait être engagée en cas de retard ou d’inexécution résultant d’un cas de force majeure ou d’une cause extérieure indépendante de sa volonté, notamment le fait ou le retard des autorités administratives, les conditions climatiques exceptionnelles, le défaut ou retard de livraison des matériaux, ou le fait d’un tiers. En pareil cas, les délais sont suspendus pour la durée de l’événement, sans donner lieu à indemnité.',
      ],
    },
    {
      numero: 11,
      titre: 'Confidentialité',
      paragraphes: [
        'Grey Concrete s’engage à préserver la confidentialité des informations échangées dans le cadre du projet et à ne pas les divulguer à des tiers sans le consentement du client, sauf en cas d’obligation légale.',
      ],
    },
    {
      numero: 12,
      titre: 'Résiliation',
      paragraphes: [
        'En cas de manquement du client à ses obligations, notamment de paiement, Grey Concrete se réserve le droit de résilier le contrat après une mise en demeure restée sans effet pendant quinze (15) jours. Les sommes déjà versées restent acquises à Grey Concrete à hauteur des prestations effectivement réalisées à la date de résiliation, le solde éventuel faisant l’objet d’un décompte.',
        'Le client peut également résilier le contrat à tout moment ; dans ce cas, les prestations réalisées jusqu’à la date de résiliation restent dues et sont facturées au prorata de l’avancement.',
      ],
    },
    {
      numero: 13,
      titre: 'Pénalités de retard',
      paragraphes: [
        'Tout retard de paiement au-delà de l’échéance convenue entraîne de plein droit l’application de pénalités de retard au taux de 1,5 % par mois sur les sommes dues, sans préjudice de la faculté pour Grey Concrete de suspendre les prestations en cours jusqu’à régularisation.',
      ],
    },
    {
      numero: 14,
      titre: 'Validité de l’offre',
      paragraphes: [
        'Les devis émis par Grey Concrete sont valables sept (7) jours à compter de leur date d’émission, sauf mention contraire. Passé ce délai, les prix et conditions sont susceptibles de révision.',
      ],
    },
    {
      numero: 15,
      titre: 'Litiges',
      paragraphes: [
        'Tout différend relatif à l’exécution ou à l’interprétation des présentes conditions générales sera soumis à la juridiction compétente de Dakar.',
      ],
    },
  ],
};

// Par société (slug) ; absent = pas de CGV jointes à l'offre.
export const CGV_PAR_SOCIETE: Record<string, Cgv> = { 'grey-concrete': GREY_CONCRETE };
