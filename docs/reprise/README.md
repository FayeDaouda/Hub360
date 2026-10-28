# Reprise des données (lot D)

Quatre modèles Excel pour reprendre dans le HUB les données de l'entreprise au
moment de la mise en service. Ils sont remplis par les services, importés une
première fois à blanc (contrôle), puis pour de vrai.

| Fichier                               | Contenu                                                   | Préparé et validé par |
| ------------------------------------- | --------------------------------------------------------- | --------------------- |
| `modeles/1-clients-actifs.xlsx`       | clients avec un projet en cours ou une facture non soldée | COO                   |
| `modeles/2-projets-en-cours.xlsx`     | projets signés, non livrés                                | COO                   |
| `modeles/3-salaries-presents.xlsx`    | personnes présentes à la date de reprise                  | RH                    |
| `modeles/4-factures-non-soldees.xlsx` | factures émises avec un reste dû                          | CFO                   |

Chaque classeur contient :

- **À lire** : objet, date de reprise (à remplir), règles, légende, points à trancher ;
- **Données** : la feuille à remplir, avec listes déroulantes et contrôles de date et de nombre ;
- **Colonnes** : format attendu, valeurs autorisées, exemple et destination dans le HUB ;
- **Exemple** : une ligne remplie avec des données fictives ;
- **Listes** : les valeurs des listes déroulantes (énumérations du HUB, référentiel des
  localités, sociétés, étapes du gabarit GC-CONCEPTION).

## Règles

- **Une date de reprise commune aux quatre fichiers**, par exemple la veille de la mise en
  service. Soldes de congés, montants payés et restes dus s'entendent à cette date.
- **Factures** : elles gardent leur numéro d'origine et sont marquées « reprise ». La
  numérotation du HUB (GC-2026-…) commence après elles, sans les mélanger.
- Les liens entre fichiers se font par le nom exact du client et par le code du projet.

## Colonnes

La liste vient de la direction (28/10/2026). Elle est complétée par les champs obligatoires
ou utiles du schéma : nature, type de bien et statut d'un projet, métier, niveau, lieu de
naissance et coordonnées de paiement d'un salarié, type et libellé d'une facture.

## Points à trancher avant l'import

1. **Colonnes sans champ dans le HUB** (11) : décider pour chacune s'il faut ajouter le champ ou
   ne pas la reprendre.
   - Clients : RCCM, source du contact, date du premier contact, remarques ; et le prénom (le HUB
     n'a qu'un champ « nom » ; proposition : réunir « Prénom Nom »).
   - Projets : nom du projet, date de livraison prévue (servent au contrôle).
   - Salariés : téléphone personnel, n° IPRES, n° CSS, solde de congés.
2. **Code d'un projet repris** : le HUB génère le code (`CLIENT_LOC.AA`) et ne le laisse jamais
   saisir. Proposition : garder le code existant, qui figure déjà sur les documents du projet.
3. **Étape actuelle d'un projet repris** : règle de reprise des tâches à fixer. Par exemple,
   les tâches des étapes antérieures sont marquées validées, celles de l'étape actuelle restent
   à faire.
4. **Matricule** : le HUB attribue un matricule de groupe (GH-0001…). Proposition : garder le
   matricule existant en référence.
5. **Solde de congés** : il dépend des règles de congés à faire confirmer par la direction (D15).
6. **Factures** :
   - marquer une facture « reprise » demande un champ, à ajouter avec l'outil d'import ;
   - le montant déjà payé est repris comme un versement unique à la date de reprise, sauf avis
     contraire du CFO.

## Régénérer les modèles

`generer-modeles.py` (Python, openpyxl) produit les quatre classeurs. Les localités viennent
de la base, la commande est en tête du script. Les colonnes se modifient dans ce script, pas
à la main dans les fichiers.
