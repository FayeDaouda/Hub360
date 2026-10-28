"""Modèles Excel de reprise des données (lot D) — hub360°.

Quatre classeurs : clients actifs, projets en cours, salariés présents,
factures non soldées. Chacun : « À lire », « Données » (à remplir),
« Colonnes » (format, valeurs autorisées, exemple, destination dans le HUB),
« Exemple » (une ligne remplie, fictive), « Listes » (listes déroulantes).

Colonnes : liste fournie par le user (28/10/2026), complétée par les champs
obligatoires ou utiles du schéma (backend/prisma/schema.prisma). Valeurs des
listes : énumérations du schéma, référentiel des localités et sociétés de la
base de développement, étapes du gabarit GC-CONCEPTION.
"""
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

# Usage (depuis la racine du dépôt, openpyxl installé) :
#   psql "$DATABASE_URL" -At -F'|' -c "select code, nom, region, zone from localites order by
#     case zone when 'dakar' then 0 when 'senegal' then 1 else 2 end, ordre, nom" > localites.txt
#   python docs/reprise/generer-modeles.py docs/reprise/modeles localites.txt
OUT = Path(sys.argv[1])
LOCALITES = [l.split('|') for l in Path(sys.argv[2]).read_text().splitlines() if l.strip()]
SOCIETES = ['Grey Concrete', "CODE'D Group", 'Grey Holding']

FONT = 'Arial'
F_TITLE = Font(name=FONT, size=14, bold=True)
F_H = Font(name=FONT, size=10, bold=True, color='FFFFFF')
F_B = Font(name=FONT, size=10)
F_BOLD = Font(name=FONT, size=10, bold=True)
F_NOTE = Font(name=FONT, size=9, italic=True, color='555555')
FILL_H = PatternFill('solid', fgColor='3D4A8F')  # en-tête
FILL_REQ = PatternFill('solid', fgColor='B23C3C')  # en-tête obligatoire
FILL_IN = PatternFill('solid', fgColor='FFF4C2')  # cellule à remplir
FILL_GAP = PatternFill('solid', fgColor='FCE4D6')  # pas encore de champ dans le HUB
FILL_EX = PatternFill('solid', fgColor='EEF1F8')
THIN = Side(style='thin', color='C8CCD8')
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical='top')

GAP = 'Pas encore de champ dans le HUB : à décider (ajouter le champ, ou ne pas reprendre).'


def col(header, required, fmt, allowed, example, dest, kind='text', width=22, options=None, gap=False):
    return dict(header=header, required=required, fmt=fmt, allowed=allowed, example=example, dest=dest,
                kind=kind, width=width, options=options, gap=gap)


def localite_labels():
    return [f'{nom} ({code})' for code, nom, *_ in LOCALITES]


TYPE_CLIENT = ['Particulier', 'SCI', 'Entreprise', 'Institution']
APPORTEUR = ['Aucun (affaire directe)', 'Externe']
COMMISSION = ['3', '3,5', '4', '4,5', '5']
NATURE = ['Mandat client', 'Promotion interne']
CATEGORIE = ['Conception', 'Développement', 'Aménagement']
OFFRE_CO = ['CO1', 'CO2', 'CO3']
TYPE_BIEN = ['Villa', 'Immeuble résidentiel', 'Immeuble mixte', 'Immeuble de bureaux', 'Local commercial',
             'Hôtelier', 'Équipement']
STANDING = ['Économique', 'Moyen', 'Grand']
GAMME = ['Local', 'Importé', 'Sur mesure importé']
ETAPES = ['01 Onboard', '02 Avant-projet', '03 Images', '04 Autorisations', '05 Études',
          "06 Plans d'exécution"]
STATUT_CHANTIER = ['En conception', 'En chantier']
TRANCHES_FAITES = ['Aucune', 'F1', 'F1 et F2', 'F1, F2 et F3']
CONTRAT = ['CDI', 'CDD', 'Stage']
NIVEAU = ['Stagiaire', 'Junior', 'Confirmé', 'Senior', 'Lead']
SITUATION = ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf (veuve)']
PAIE = ['Virement', 'Wave', 'Orange Money']
TYPE_FACTURE = ['Honoraires', 'Vente']
TRANCHE = ['F1 (signature)', 'F2 (avant-projet)', 'F3 (livraison)', 'Hors échéancier']

DATE = 'Date (JJ/MM/AAAA)'
FCFA = 'Nombre entier, en FCFA, sans espace ni symbole'

MODELES = [
    dict(
        fichier='1-clients-actifs.xlsx', titre='Clients actifs', qui='Préparé et validé par le COO.',
        objet="Un client par ligne : les clients avec au moins un projet en cours ou une facture non soldée.",
        points=[
            "Prénom : le HUB n'a qu'un champ « nom » ; proposition : réunir « Prénom Nom » pour un particulier.",
            'RCCM, source du contact, date du premier contact, remarques : pas encore de champ dans le HUB.',
            "Localité et apporteur : le HUB les rattache à chaque dossier (projet), pas au client ; ils serviront "
            'de valeur par défaut pour les projets repris de ce client.',
        ],
        colonnes=[
            col('Type de client', True, 'Liste', ', '.join(TYPE_CLIENT), 'Entreprise', 'Client · type', 'list', 16, TYPE_CLIENT),
            col('Nom ou raison sociale', True, 'Texte', "Particulier : nom de famille. Personne morale : raison sociale.",
                'Exemple Immobilier SARL', 'Client · nom', width=30),
            col('Prénom', False, 'Texte', 'Particulier seulement', '', 'Client · nom (réunis « Prénom Nom »)', gap=True),
            col('Sigle', False, 'Texte', 'Personne morale', 'EXI', 'Client · sigle', width=12),
            col('Téléphone', False, 'Texte', 'Avec l’indicatif : +221 77 000 00 00', '+221 77 000 00 00', 'Client · téléphone'),
            col('E-mail', False, 'Texte', 'Adresse e-mail valide', 'contact@exemple.sn', 'Client · e-mail', width=26),
            col('Adresse', False, 'Texte', 'Rue, quartier, ville', 'Rue 10, Almadies, Dakar', 'Client · adresse', width=28),
            col('Localité', False, 'Liste', 'Référentiel des localités du HUB (feuille Listes)', 'Almadies (ALM)',
                'Dossier · localité (par défaut pour les projets du client)', 'list', 22, localite_labels()),
            col('NINEA', False, 'Texte', 'Entreprise, SCI, institution', '0000000 0A0', 'Client · NINEA', width=16),
            col('RCCM', False, 'Texte', 'Entreprise, SCI', 'SN.DKR.2020.B.00000', GAP, gap=True),
            col('Contact principal', False, 'Texte', 'Personne morale : nom, fonction, téléphone',
                'Awa Exemple, gérante, +221 77 000 00 01', 'Client · contact', width=34),
            col('Apporteur', True, 'Liste', ', '.join(APPORTEUR), 'Externe', 'Dossier · apporteur (par défaut)', 'list', 22, APPORTEUR),
            col("Nom de l'apporteur", False, 'Texte', 'Obligatoire si apporteur externe', 'Moussa Exemple', 'Dossier · apporteur, nom'),
            col("Structure de l'apporteur", False, 'Texte', 'Facultatif', 'Exemple Conseil', 'Dossier · apporteur, structure'),
            col("Téléphone de l'apporteur", False, 'Texte', 'Facultatif', '+221 78 000 00 00', 'Dossier · apporteur, téléphone'),
            col("Commission de l'apporteur (%)", False, 'Liste', 'Obligatoire si apporteur externe : 3 ; 3,5 ; 4 ; 4,5 ; 5',
                '4', 'Dossier · commission', 'list', 14, COMMISSION),
            col('Source du contact', False, 'Texte', 'Bouche-à-oreille, apporteur, site, réseaux…', 'Apporteur', GAP, gap=True),
            col('Date du premier contact', False, DATE, 'Date passée', '2026-03-12', GAP, 'date', 16, gap=True),
            col('Remarques', False, 'Texte', 'Libre', '', GAP, width=30, gap=True),
        ],
    ),
    dict(
        fichier='2-projets-en-cours.xlsx', titre='Projets en cours', qui='Préparé et validé par le COO.',
        objet="Un projet par ligne : projets signés, non livrés. Le client doit figurer dans le fichier « Clients actifs ».",
        points=[
            "Code du projet : le HUB le génère (CLIENT_LOC.AA) et ne le laisse jamais saisir ; proposition : garder "
            "le code existant d'un projet repris (il figure déjà sur ses documents).",
            "Étape actuelle : la règle de reprise des tâches reste à fixer (tâches des étapes antérieures marquées "
            'validées, celles de l’étape actuelle à faire ?).',
            "Montant HT des honoraires : pas de champ sur le projet ; il sert à reconstituer l'offre signée.",
            'Nom du projet, date de livraison prévue : pas de champ dédié (le HUB identifie un projet par son code '
            'et calcule la livraison depuis J1 et le budget atelier) ; servent au contrôle.',
        ],
        colonnes=[
            col('Code du projet', True, 'Texte', 'Code existant, ex. FS_POI.26', 'EXE_ALM.26', 'Projet · code (à confirmer)', width=16),
            col('Client', True, 'Texte', "Exactement le « Nom ou raison sociale » du fichier Clients actifs",
                'Exemple Immobilier SARL', 'Projet · client', width=28),
            col('Nom du projet', False, 'Texte', 'Libre', 'Villa R+2 Almadies', 'Contrôle (pas de champ dédié)', width=26, gap=True),
            col('Société', True, 'Liste', ', '.join(SOCIETES), 'Grey Concrete', 'Projet · société', 'list', 18, SOCIETES),
            col('Nature', True, 'Liste', ', '.join(NATURE), 'Mandat client', 'Dossier · nature', 'list', 18, NATURE),
            col('Catégorie', True, 'Liste', ', '.join(CATEGORIE), 'Conception', 'Projet · catégorie', 'list', 16, CATEGORIE),
            col('Offre de conception (CO1 à CO3)', False, 'Liste', 'Catégorie Conception : ' + ', '.join(OFFRE_CO), 'CO2',
                'Dossier · offre de conception', 'list', 16, OFFRE_CO),
            col('Type de bien', True, 'Liste', ', '.join(TYPE_BIEN), 'Villa', 'Projet · type de bien', 'list', 20, TYPE_BIEN),
            col('Localité', True, 'Liste', 'Référentiel des localités du HUB (feuille Listes)', 'Almadies (ALM)',
                'Dossier · localité', 'list', 22, localite_labels()),
            col('Surface du terrain (m²)', True, 'Nombre entier', 'Surface du terrain (décision du boss)', 400,
                'Dossier · surface', 'int', 14),
            col('Nombre de planches', True, 'Nombre entier', 'De 1 à 99', 3, 'Dossier · planches', 'int', 12),
            col('Standing', False, 'Liste', ', '.join(STANDING), 'Moyen', 'Dossier · standing', 'list', 14, STANDING),
            col('Gamme des matériaux', False, 'Liste', ', '.join(GAMME), 'Local', 'Dossier · gamme', 'list', 18, GAMME),
            col('Programme', False, 'Texte', 'Résumé : niveaux, pièces', 'R+2, 5 chambres, piscine', 'Dossier · programme', width=28),
            col('Dir. GC responsable', True, 'Texte', 'Prénom Nom, tel que dans le HUB', 'Cheikh Exemple', 'Dossier · titulaire (Dir. GC)', width=20),
            col('Cellule', False, 'Texte', 'Nom de la cellule, tel que dans le HUB', 'Archi 3', 'Projet · cellule', width=14),
            col('Chef de team', False, 'Texte', 'Contrôle : chef de la cellule', 'Aïssatou Exemple', 'Contrôle (déduit de la cellule)', width=20),
            col("Date d'ouverture (J1)", True, DATE, 'Date de démarrage du projet', '2026-09-01', 'Projet · ouvert le', 'date', 16),
            col('Date de livraison prévue', False, DATE, 'Contrôle', '2026-12-15', 'Contrôle (calculée par le HUB)', 'date', 16, gap=True),
            col('Statut', True, 'Liste', ', '.join(STATUT_CHANTIER), 'En conception', 'Projet · statut du chantier', 'list', 16, STATUT_CHANTIER),
            col('Étape actuelle', True, 'Liste', 'Étapes du gabarit GC-CONCEPTION : ' + ', '.join(ETAPES), '02 Avant-projet',
                'Projet · étapes (règle de reprise à fixer)', 'list', 20, ETAPES),
            col('Montant HT des honoraires (FCFA)', True, FCFA, 'Total HT de l’offre signée', 12000000,
                "Offre signée reconstituée", 'money', 18),
            col('Tranches déjà facturées', True, 'Liste', ', '.join(TRANCHES_FAITES), 'F1', 'Contrôle avec le fichier Factures',
                'list', 16, TRANCHES_FAITES),
        ],
    ),
    dict(
        fichier='3-salaries-presents.xlsx', titre='Salariés présents', qui='Préparé et validé par la RH.',
        objet='Un salarié par ligne : personnes présentes à la date de reprise (stagiaires compris).',
        points=[
            'Matricule : le HUB attribue un matricule de groupe (GH-0001…) ; proposition : garder le matricule '
            'existant en référence et laisser le HUB attribuer le sien.',
            "N+1 : le HUB le déduit de la cellule (son chef) ; la colonne sert au contrôle.",
            'Téléphone personnel, numéros IPRES et CSS : pas encore de champ dans le HUB (seul le n° IPM existe).',
            'Solde de congés : pas de champ ; dépend des règles de congés à faire confirmer par la direction (D15) '
            'avant l’import.',
        ],
        colonnes=[
            col('Matricule', False, 'Texte', 'Matricule actuel', 'GC-012', 'Référence (le HUB attribue GH-0001…)', width=12),
            col('Nom', True, 'Texte', 'Nom officiel (pièce d’identité)', 'Exemple', 'Fiche · nom', width=18),
            col('Prénom', True, 'Texte', 'Prénom officiel', 'Fatou', 'Fiche · prénom', width=18),
            col('Date de naissance', False, DATE, '', '1994-05-21', 'Dossier · date de naissance', 'date', 16),
            col('Lieu de naissance', False, 'Texte', '', 'Dakar', 'Dossier · lieu de naissance', width=16),
            col('Nationalité', False, 'Texte', '', 'Sénégalaise', 'Dossier · nationalité', width=14),
            col('Société', True, 'Liste', ', '.join(SOCIETES), 'Grey Concrete', 'Dossier · société', 'list', 18, SOCIETES),
            col('Poste', True, 'Texte', 'Intitulé du poste', 'Architecte de projet', 'Dossier · poste', width=22),
            col('Métier', True, 'Texte', 'Architecte, Designer, Dessinateur…', 'Architecte', 'Fiche · métier', width=16),
            col('Niveau', False, 'Liste', ', '.join(NIVEAU), 'Confirmé', 'Fiche · niveau', 'list', 12, NIVEAU),
            col('Cellule', False, 'Texte', 'Nom de la cellule, tel que dans le HUB', 'Archi 3', 'Fiche · cellule', width=14),
            col('N+1', False, 'Texte', 'Contrôle : chef de la cellule', 'Aïssatou Exemple', 'Contrôle (déduit de la cellule)', width=20),
            col('Téléphone professionnel', False, 'Texte', '+221 …', '+221 77 000 00 02', 'Dossier · téléphone', width=18),
            col('Téléphone personnel', False, 'Texte', '+221 …', '+221 76 000 00 02', GAP, width=18, gap=True),
            col('E-mail professionnel', False, 'Texte', '', 'fatou@exemple.sn', 'Dossier · e-mail pro', width=24),
            col('E-mail personnel', False, 'Texte', '', 'fatou.perso@exemple.sn', 'Dossier · e-mail perso', width=24),
            col('Adresse', False, 'Texte', '', 'Ouakam, Dakar', 'Dossier · adresse', width=22),
            col("Contact d'urgence", False, 'Texte', 'Nom et lien', 'Mamadou Exemple (frère)', "Dossier · contact d'urgence", width=24),
            col("Téléphone d'urgence", False, 'Texte', '', '+221 77 000 00 03', "Dossier · téléphone d'urgence", width=18),
            col('Situation familiale', False, 'Liste', ', '.join(SITUATION), 'Marié(e)', 'Dossier · situation familiale', 'list', 16, SITUATION),
            col('Enfants à charge', False, 'Nombre entier', '', 2, 'Dossier · enfants à charge', 'int', 12),
            col('Type de contrat', True, 'Liste', ', '.join(CONTRAT), 'CDI', 'Dossier · contrat', 'list', 12, CONTRAT),
            col("Date d'entrée", True, DATE, '', '2024-02-01', "Dossier · date d'entrée", 'date', 14),
            col("Fin de période d'essai", False, DATE, '', '2024-05-01', "Dossier · fin d'essai", 'date', 14),
            col('Fin de contrat', False, DATE, 'CDD et stage', '', 'Dossier · fin de contrat', 'date', 14),
            col('Salaire brut de base (FCFA/mois)', False, FCFA, 'Brut mensuel de base', 650000,
                'Salaire en vigueur (date d’effet : reprise)', 'money', 18),
            col('Mode de paiement du salaire', False, 'Liste', ', '.join(PAIE), 'Virement', 'Dossier · mode de paiement', 'list', 16, PAIE),
            col('RIB ou numéro de paiement', False, 'Texte', 'RIB (virement) ou numéro (Wave, Orange Money)',
                'SN000 00000 000000000000 00', 'Dossier · coordonnées de paiement', width=28),
            col('N° IPM', False, 'Texte', '', '000000', 'Dossier · n° IPM', width=12),
            col('N° IPRES', False, 'Texte', '', '000000', GAP, width=12, gap=True),
            col('N° CSS', False, 'Texte', '', '000000', GAP, width=12, gap=True),
            col("N° de pièce d'identité", False, 'Texte', 'CNI ou passeport', '1 234 1994 00000', 'Dossier · n° de pièce', width=20),
            col("Expiration de la pièce", False, DATE, '', '2030-05-20', 'Dossier · expiration de la pièce', 'date', 14),
            col('Prochaine visite médicale', False, DATE, '', '2027-01-15', 'Dossier · visite médicale', 'date', 14),
            col('Solde de congés (jours)', False, 'Nombre (une décimale)', 'À la date de reprise ; règles D15 à valider',
                12.5, GAP, 'decimal', 14, gap=True),
        ],
    ),
    dict(
        fichier='4-factures-non-soldees.xlsx', titre='Factures non soldées', qui='Préparé et validé par le CFO.',
        objet="Une facture par ligne : factures émises dont il reste un montant dû à la date de reprise.",
        points=[
            "Les factures reprises gardent leur numéro d'origine et sont marquées « reprise » ; la numérotation du HUB "
            '(GC-2026-…) commence après elles, sans les mélanger. Le marquage « reprise » demande un champ à ajouter '
            'à l’import.',
            "Montant déjà payé : repris comme un versement unique à la date de reprise (le détail des versements "
            'antérieurs n’est pas repris), sauf avis contraire du CFO.',
            'Pièce jointe : le PDF de chaque facture est fourni à part, nommé comme dans la colonne « Fichier ».',
        ],
        colonnes=[
            col("Numéro d'origine", True, 'Texte', 'Numéro imprimé sur la facture', 'F2026-0012', 'Facture · référence (reprise)', width=16),
            col('Société', True, 'Liste', ', '.join(SOCIETES), 'Grey Concrete', 'Facture · société', 'list', 18, SOCIETES),
            col("Date d'émission", True, DATE, '', '2026-09-03', 'Facture · émise le', 'date', 14),
            col('Client', True, 'Texte', "Exactement le « Nom ou raison sociale » du fichier Clients actifs",
                'Exemple Immobilier SARL', 'Facture · client', width=28),
            col('Code du projet', False, 'Texte', 'Code du fichier Projets en cours', 'EXE_ALM.26', 'Facture · projet', width=16),
            col('Type', True, 'Liste', ', '.join(TYPE_FACTURE), 'Honoraires', 'Facture · type', 'list', 14, TYPE_FACTURE),
            col('Tranche', False, 'Liste', ', '.join(TRANCHE), 'F1 (signature)', 'Facture · jalon', 'list', 18, TRANCHE),
            col('Libellé', False, 'Texte', 'Objet de la facture', 'Honoraires de conception, tranche 1', 'Facture · libellé', width=30),
            col('Montant HT (FCFA)', True, FCFA, '', 4800000, 'Facture · montant HT', 'money', 16),
            col('Taux de TVA (%)', True, 'Nombre', 'Ex. 18 ; 0 si exonéré', 18, 'Facture · taux de TVA', 'decimal', 10),
            col('Montant TVA (FCFA)', True, FCFA, 'Contrôle : HT × taux', 864000, 'Contrôle', 'money', 14),
            col('Montant TTC (FCFA)', True, FCFA, 'Contrôle : HT + TVA', 5664000, 'Contrôle', 'money', 16),
            col('Déjà payé (FCFA)', True, FCFA, 'À la date de reprise', 2000000, 'Versement de reprise', 'money', 16),
            col('Reste dû (FCFA)', True, FCFA, 'Contrôle : TTC − déjà payé', 3664000, 'Contrôle', 'money', 16),
            col('Échéance', False, DATE, 'Date limite de paiement', '2026-10-03', 'Facture · échéance', 'date', 14),
            col('Fichier', False, 'Texte', 'Nom du PDF de la facture, fourni à part', 'F2026-0012.pdf', 'Facture · pièce jointe', width=20),
        ],
    ),
]


def style_cell(c, font=F_B, fill=None, border=True, align=WRAP):
    c.font = font
    if fill:
        c.fill = fill
    if border:
        c.border = BOX
    c.alignment = align


def build(m):
    wb = Workbook()
    cols = m['colonnes']
    n = len(cols)

    # --- À lire ---------------------------------------------------------------------
    ws = wb.active
    ws.title = 'À lire'
    ws.sheet_view.showGridLines = False
    ws.column_dimensions['A'].width = 3
    ws.column_dimensions['B'].width = 34
    ws.column_dimensions['C'].width = 90
    ws['B2'] = f'hub360° · reprise des données · {m["titre"]}'
    ws['B2'].font = F_TITLE
    rows = [
        ('Objet', m['objet']),
        ('Qui', m['qui'] + ' Import d’abord à blanc (contrôle), puis réel.'),
        ('Date de reprise', None),
        ('Règle', 'La même date de reprise dans les quatre fichiers (par exemple la veille de la mise en service). '
                  'Soldes de congés, montants payés et restes dus s’entendent à cette date.'),
        ('Où saisir', 'Feuille « Données », à partir de la ligne 2. Ne pas modifier, déplacer ni renommer les colonnes.'),
        ('Colonnes', 'Feuille « Colonnes » : format attendu, valeurs autorisées, exemple et destination dans le HUB.'),
        ('Exemple', 'Feuille « Exemple » : une ligne remplie avec des données fictives.'),
        ('Formats', 'Dates au format JJ/MM/AAAA. Montants en FCFA, nombres entiers sans espace ni symbole. '
                    'Listes déroulantes : choisir une valeur de la liste.'),
        ('Légende', None),
    ]
    r = 4
    for label, text in rows:
        ws.cell(r, 2, label).font = F_BOLD
        ws.cell(r, 2).alignment = Alignment(vertical='top')
        if label == 'Date de reprise':
            c = ws.cell(r, 3)
            style_cell(c, F_BOLD, FILL_IN)
            c.number_format = 'DD/MM/YYYY'
            c.comment = Comment('À remplir : la même date dans les quatre fichiers.', 'hub360°')
            ws.cell(r + 1, 3, '↑ à remplir (même date dans les quatre fichiers)').font = F_NOTE
            r += 2
            continue
        if label == 'Légende':
            for i, (fill, txt) in enumerate([
                (FILL_REQ, 'En-tête rouge : colonne obligatoire (marquée *).'),
                (FILL_H, 'En-tête bleu : colonne facultative.'),
                (FILL_GAP, 'Destination orangée (feuille Colonnes) : pas encore de champ dans le HUB.'),
                (FILL_IN, 'Fond jaune : cellule à remplir.'),
            ]):
                c = ws.cell(r + i, 2, '')
                c.fill = fill
                c.border = BOX
                ws.cell(r + i, 3, txt).font = F_B
            r += 5
            continue
        ws.cell(r, 3, text).font = F_B
        ws.cell(r, 3).alignment = WRAP
        r += 1
    ws.cell(r, 2, 'Points à trancher').font = F_BOLD
    ws.cell(r, 2).alignment = Alignment(vertical='top')
    for p in m['points']:
        c = ws.cell(r, 3, '• ' + p)
        c.font = F_B
        c.alignment = WRAP
        r += 1

    # --- Listes ---------------------------------------------------------------------
    wl = wb.create_sheet('Listes')
    list_ranges = {}
    li = 1
    for c in cols:
        if c['options']:
            letter = get_column_letter(li)
            wl.cell(1, li, c['header']).font = F_BOLD
            for k, v in enumerate(c['options'], start=2):
                wl.cell(k, li, v).font = F_B
            wl.column_dimensions[letter].width = max(16, min(40, max(len(str(v)) for v in c['options']) + 2))
            list_ranges[c['header']] = f"Listes!${letter}$2:${letter}${len(c['options']) + 1}"
            li += 1

    # --- Données ----------------------------------------------------------------------
    wd = wb.create_sheet('Données', 1)
    wd.freeze_panes = 'A2'
    for i, c in enumerate(cols, start=1):
        h = wd.cell(1, i, c['header'] + (' *' if c['required'] else ''))
        style_cell(h, F_H, FILL_REQ if c['required'] else FILL_H, align=Alignment(wrap_text=True, vertical='center'))
        h.comment = Comment(f"{c['fmt']}. {c['allowed']}".strip(' .') + '.', 'hub360°')
        wd.column_dimensions[get_column_letter(i)].width = c['width']
        letter = get_column_letter(i)
        rng = f'{letter}2:{letter}2000'
        if c['kind'] == 'list':
            dv = DataValidation(type='list', formula1=list_ranges[c['header']], allow_blank=True,
                                showErrorMessage=True, errorTitle='Valeur non prévue',
                                error='Choisissez une valeur de la liste (feuille Listes).')
            wd.add_data_validation(dv)
            dv.add(rng)
        elif c['kind'] == 'date':
            dv = DataValidation(type='date', operator='greaterThan', formula1='DATE(1900,1,2)', allow_blank=True,
                                showErrorMessage=True, errorTitle='Date attendue', error='Saisissez une date JJ/MM/AAAA.')
            wd.add_data_validation(dv)
            dv.add(rng)
            for rr in range(2, 502):
                wd.cell(rr, i).number_format = 'DD/MM/YYYY'
        elif c['kind'] in ('int', 'money'):
            dv = DataValidation(type='whole', operator='greaterThanOrEqual', formula1='0', allow_blank=True,
                                showErrorMessage=True, errorTitle='Nombre entier attendu',
                                error='Saisissez un nombre entier positif, sans espace ni symbole.')
            wd.add_data_validation(dv)
            dv.add(rng)
            if c['kind'] == 'money':
                for rr in range(2, 502):
                    wd.cell(rr, i).number_format = '#,##0'
        elif c['kind'] == 'decimal':
            dv = DataValidation(type='decimal', operator='greaterThanOrEqual', formula1='0', allow_blank=True,
                                showErrorMessage=True, errorTitle='Nombre attendu', error='Saisissez un nombre positif.')
            wd.add_data_validation(dv)
            dv.add(rng)
    wd.row_dimensions[1].height = 42

    # --- Colonnes ---------------------------------------------------------------------
    wc = wb.create_sheet('Colonnes', 2)
    wc.freeze_panes = 'A2'
    heads = ['Colonne', 'Obligatoire', 'Format attendu', 'Valeurs autorisées / précisions', 'Exemple', 'Destination dans le HUB']
    widths = [30, 12, 22, 60, 30, 46]
    for i, (t, w) in enumerate(zip(heads, widths), start=1):
        style_cell(wc.cell(1, i, t), F_H, FILL_H)
        wc.column_dimensions[get_column_letter(i)].width = w
    for r, c in enumerate(cols, start=2):
        ex = c['example']
        if c['kind'] == 'date' and ex:
            y, mo, d = str(ex).split('-')
            ex = f'{d}/{mo}/{y}'
        vals = [c['header'], 'Oui' if c['required'] else 'Non', c['fmt'],
                c['allowed'] if c['kind'] != 'list' or len(c['options'] or []) < 20 else c['allowed'],
                ex, c['dest']]
        for i, v in enumerate(vals, start=1):
            style_cell(wc.cell(r, i, v), F_B, FILL_GAP if (i == 6 and c['gap']) else None)

    # --- Exemple ----------------------------------------------------------------------
    we = wb.create_sheet('Exemple', 3)
    we.freeze_panes = 'A2'
    for i, c in enumerate(cols, start=1):
        style_cell(we.cell(1, i, c['header'] + (' *' if c['required'] else '')), F_H,
                   FILL_REQ if c['required'] else FILL_H, align=Alignment(wrap_text=True, vertical='center'))
        we.column_dimensions[get_column_letter(i)].width = c['width']
        v = c['example']
        cell = we.cell(2, i)
        if c['kind'] == 'date' and v:
            from datetime import date
            y, mo, d = map(int, str(v).split('-'))
            cell.value = date(y, mo, d)
            cell.number_format = 'DD/MM/YYYY'
        else:
            cell.value = v if v != '' else None
            if c['kind'] == 'money':
                cell.number_format = '#,##0'
        style_cell(cell, F_B, FILL_EX)
    we.row_dimensions[1].height = 42
    we.cell(4, 1, 'Données fictives, pour montrer le format attendu : ne pas recopier.').font = F_NOTE

    wb.active = 0
    path = OUT / m['fichier']
    wb.save(path)
    return path, n, sum(1 for c in cols if c['required']), sum(1 for c in cols if c['gap'])


OUT.mkdir(parents=True, exist_ok=True)
for m in MODELES:
    p, n, req, gap = build(m)
    print(f'{p.name} : {n} colonnes, {req} obligatoires, {gap} sans champ dans le HUB')
