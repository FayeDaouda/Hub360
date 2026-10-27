# ADR 0006 — Suivi des erreurs en production, sans service extérieur

- Statut : accepté (27/10/2026)
- Contexte de décision : piste Exploitation (« suivi des erreurs en
  production »), conduite en autonomie dans le cadre de l'autorisation
  permanente : ni nouvelle dépendance, ni migration de base.

## Contexte

Avant le lancement, une erreur en production ne laissait qu'une ligne dans
les journaux du conteneur, que personne ne lisait. Les services spécialisés
(Sentry, GlitchTip) demandent un compte ou un serveur de plus, une dépendance
dans le back et dans le front, et l'envoi de données d'usage à un tiers :
autant de décisions qui ne bloquent pas le lancement.

## Décision

1. **Une ligne JSON par erreur** dans les journaux du conteneur
   (`"suivi":"erreur"`) : réponses 5xx de l'API (filtre global, avec le
   modèle de route, jamais l'adresse et ses jetons), erreurs du journal du
   serveur (`TrackingLogger` : tâches planifiées, envois d'e-mail…), erreurs
   arrêtant le processus, et erreurs du navigateur d'un utilisateur connecté
   (`POST /api/erreurs-client`, débit limité, rien en base).
2. **Une alerte par e-mail** à `ALERTES_EMAIL`, au plus une par quart d'heure
   (la première tout de suite, les suivantes regroupées), par le service
   d'e-mail existant.
3. **La surveillance des sauvegardes passe par le même canal** : test de
   restauration hebdomadaire sur les vraies données dans l'image de
   sauvegarde, contrôle chaque matin par l'API (sauvegarde manquante, test en
   échec ou trop ancien).
4. **Un état de santé** (`GET /api/sante`, 200 ou 503) pour le contrôle de
   santé du conteneur, le contrôle après déploiement et une sonde externe.

## Conséquences

- Les erreurs se lisent dans les journaux (`docker compose logs backend`) ;
  l'e-mail ne donne que le résumé (pas de pile, pas de donnée métier).
- Un service spécialisé (regroupement, tendances, versions) pourra remplacer
  l'alerte par e-mail plus tard : c'est une décision à part (dépendance,
  sous-traitant de données).
