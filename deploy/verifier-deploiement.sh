#!/bin/sh
# Contrôle d'un HUB déployé (pré-production ou production), après chaque
# mise à jour :
#   deploy/verifier-deploiement.sh https://preprod.hub.greyconcrete.sn
# HUB_TLS_LOCAL=1 accepte le certificat local de Caddy (domaine localhost,
# CI seulement) ; partout ailleurs, le certificat doit être valide.
set -u
base="${1:?usage : verifier-deploiement.sh https://<domaine>}"
options="-sS --max-time 15"
[ "${HUB_TLS_LOCAL:-}" = 1 ] && options="$options -k"
echecs=0

controle() {
  if sh -c "$2" >/dev/null 2>&1; then
    echo "✓ $1"
  else
    echo "✗ $1"
    echecs=$((echecs + 1))
  fi
}

controle "API en service, base comprise, certificat valide (/api/sante)" \
  "curl $options -f '$base/api/sante' | grep -q '\"statut\":\"ok\"'"
controle "interface servie" "curl $options -f -L -o /dev/null '$base/'"
controle "page Swagger absente (production)" \
  "test \"\$(curl $options -o /dev/null -w '%{http_code}' '$base/api/docs')\" = 404"
controle "HSTS sur l'interface" "curl $options -f -L -I '$base/' | grep -qi '^strict-transport-security:'"
controle "en-têtes de sécurité de l'API" "curl $options -f -I '$base/api/sante' | grep -qi '^x-content-type-options: nosniff'"

if [ "$echecs" -eq 0 ]; then
  echo "✓ déploiement vérifié : $base"
elif [ "$echecs" -eq 1 ]; then
  echo "✗ 1 contrôle en échec"
  exit 1
else
  echo "✗ $echecs contrôles en échec"
  exit 1
fi
