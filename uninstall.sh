#!/usr/bin/env bash
# Removes everything install.sh created. Usage: CONNECTION=myconn DB=LEGENDBIO ./uninstall.sh
set -euo pipefail
read -r -p "Snowflake CLI connection name [${CONNECTION:-default}]: " c; CONNECTION="${c:-${CONNECTION:-default}}"
read -r -p "Database to drop [${DB:-LEGENDBIO}]: " d; DB="$(echo "${d:-${DB:-LEGENDBIO}}" | tr '[:lower:]' '[:upper:]')"
[[ "$DB" =~ ^[A-Z_][A-Z0-9_$]*$ ]] || { echo "Invalid database name"; exit 1; }
read -r -p "This drops database $DB (data, semantic view, agent, task). Type the database name to confirm: " ok
[[ "$ok" == "$DB" ]] || { echo "Cancelled"; exit 1; }

q() { snow sql -c "$CONNECTION" --enable-templating NONE -q "$1" >/dev/null 2>&1 || true; }
SI="$(snow sql -c "$CONNECTION" --format json -q "show snowflake intelligences" 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["name"] if d else "")' 2>/dev/null || true)"
[[ -n "$SI" ]] && q "alter snowflake intelligence $SI remove agent $DB.FINANCE.LEGEND_FINANCE_AGENT"
q "alter task $DB.FINANCE.LEGEND_DAILY_CLOSE_CHECKS suspend"
q "drop database if exists $DB"
echo "Dropped $DB."
echo "The account-level notification integration LEGEND_CLOSE_EMAIL was left in place (it may be shared by other installs)."
echo "Remove it with: DROP NOTIFICATION INTEGRATION LEGEND_CLOSE_EMAIL;"
