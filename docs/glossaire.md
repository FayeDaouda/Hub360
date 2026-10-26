# Glossaire

Termes et conventions du HUB, pour l'équipe et les assistants de code. Le
code est en anglais, l'interface en français : chaque entrée donne le terme
affiché et, quand il existe, son nom dans le code.

## Conventions d'affichage

- **Fuseau horaire** — toutes les dates et heures s'affichent au fuseau de
  Dakar (`Africa/Dakar`, UTC+0 toute l'année, sans heure d'été), quel que
  soit le lieu de l'utilisateur. Une échéance, une heure de message ou un
  « aujourd'hui » sont les mêmes pour tous. Code : `frontend/lib/dates.ts`,
  `backend/src/shared/dates.ts` (puis le paquet partagé, S0c). Écart en
  cours : voir `docs/feuille-de-route.md`, « Écart constaté ».
- **Jour** — une date sans heure s'échange au format ISO « AAAA-MM-JJ » et
  s'affiche « JJ/MM/AAAA » (`formatDate`) ou « JJ/MM » (`formatDayMonth`).
- **Montant** — en francs CFA, sans centimes : « 1 770 000 FCFA »
  (`formatAmount`). Les montants sont des entiers ; seuls les pourcentages
  ont des décimales.
