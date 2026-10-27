#!/bin/sh
# Compare une base et sa restauration, table par table (nombre de lignes et
# empreinte du contenu), puis séquence par séquence. Sortie en erreur au
# moindre écart : une sauvegarde n'est bonne que si sa restauration redonne
# exactement les mêmes données.
#   verifier-restauration.sh <base d'origine> <base restaurée>
# Connexion par les variables PG* habituelles (PGHOST, PGUSER, PGPASSWORD).
set -eu
origine="${1:?usage : verifier-restauration.sh <source> <restauration>}"
restauree="${2:?usage : verifier-restauration.sh <source> <restauration>}"
travail=$(mktemp -d)
trap 'rm -rf "$travail"' EXIT

# Une ligne par table (nom, lignes, empreinte), puis une par séquence.
cat >"$travail/releve.sql" <<'SQL'
SELECT format(
  'SELECT %L || '' '' || count(*) || '' '' || coalesce(md5(string_agg(t::text, ''|'' ORDER BY t::text)), ''-'') FROM %I.%I t',
  schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename
\gexec
SELECT 'seq ' || schemaname || '.' || sequencename || ' ' || coalesce(last_value::text, '-')
FROM pg_sequences
ORDER BY schemaname, sequencename;
SQL

releve() {
  psql -X -q -A -t -v ON_ERROR_STOP=1 -d "$1" -f "$travail/releve.sql"
}

releve "$origine" >"$travail/origine"
releve "$restauree" >"$travail/restauree"

if ! diff -u "$travail/origine" "$travail/restauree"; then
  echo "✗ la restauration de $origine dans $restauree diffère (ci-dessus)" >&2
  exit 1
fi
tables=$(grep -vc '^seq ' "$travail/origine" || true)
lignes=$(grep -v '^seq ' "$travail/origine" | awk '{ n += $2 } END { print n + 0 }')
sequences=$(grep -c '^seq ' "$travail/origine" || true)
pluriel() { if [ "$1" -gt 1 ]; then echo "$1 $2s"; else echo "$1 $2"; fi; }
echo "✓ restauration identique : $(pluriel "$tables" table), $(pluriel "$lignes" ligne), $(pluriel "$sequences" séquence)"
