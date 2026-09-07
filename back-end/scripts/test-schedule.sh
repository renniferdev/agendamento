#!/usr/bin/env bash
# Teste manual de horários de funcionamento, bloqueios e o efeito deles na
# disponibilidade. Rode com o backend no ar (npm run dev) e um usuário JÁ
# ONBOARDADO com um serviço de 30 min (ou crie via painel).
#
#   EMAIL=... PASS=... SLUG=... bash scripts/test-schedule.sh
set -u
U=${BASE_URL:-http://localhost:3333}; H="Content-Type: application/json"
EMAIL=${EMAIL:?informe EMAIL}; PASS=${PASS:?informe PASS}; SLUG=${SLUG:?informe SLUG do estabelecimento}
J=$(mktemp)
TOMORROW=$(python -c "import datetime as d;print((d.date.today()+d.timedelta(1)).isoformat())")
DOW=$(python -c "import datetime as d;print(((d.date.today()+d.timedelta(1)).weekday()+1)%7)")
step() { echo; echo "== $1 =="; }
json() { python -c "import sys,json;print(json.load(sys.stdin)$1)"; }

CSRF=$(curl -s -c "$J" -b "$J" "$U/auth/csrf" | json "['csrfToken']")
curl -s -c "$J" -b "$J" -o /dev/null -X POST "$U/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" --data-urlencode "password=$PASS"
SVC=$(curl -s -b "$J" "$U/admin/services" | json "[0]['id']")
echo "amanhã=$TOMORROW dayOfWeek=$DOW serviço=$SVC"

step "manhã 08-12 (201)"; H1=$(curl -s -b "$J" -X POST "$U/admin/business-hours" -H "$H" -d "{\"dayOfWeek\":$DOW,\"startTime\":\"08:00\",\"endTime\":\"12:00\"}" | json "['id']"); echo "$H1"
step "tarde 14-18 (201)"; H2=$(curl -s -b "$J" -X POST "$U/admin/business-hours" -H "$H" -d "{\"dayOfWeek\":$DOW,\"startTime\":\"14:00\",\"endTime\":\"18:00\"}" | json "['id']"); echo "$H2"
step "sobreposição 11-15 (esperado 409 OVERLAP)"; curl -s -b "$J" -w "\nHTTP %{http_code}\n" -X POST "$U/admin/business-hours" -H "$H" -d "{\"dayOfWeek\":$DOW,\"startTime\":\"11:00\",\"endTime\":\"15:00\"}"
step "início >= fim (esperado 400)"; curl -s -b "$J" -o /dev/null -w "HTTP %{http_code}\n" -X POST "$U/admin/business-hours" -H "$H" -d "{\"dayOfWeek\":$DOW,\"startTime\":\"12:00\",\"endTime\":\"12:00\"}"
step "disponibilidade amanhã (serviço 30min: esperado 16 slots)"; curl -s "$U/establishments/$SLUG/availability?serviceId=$SVC&date=$TOMORROW" | json "['slots'].__len__()"
step "bloqueio 09-10 (201)"; B1=$(curl -s -b "$J" -X POST "$U/admin/blocked-slots" -H "$H" -d "{\"startsAt\":\"${TOMORROW}T09:00:00\",\"endsAt\":\"${TOMORROW}T10:00:00\",\"reason\":\"teste\"}" | json "['id']"); echo "$B1"
step "disponibilidade com bloqueio (esperado 14)"; curl -s "$U/establishments/$SLUG/availability?serviceId=$SVC&date=$TOMORROW" | json "['slots'].__len__()"
step "lista de bloqueios futuros"; curl -s -b "$J" "$U/admin/blocked-slots" | json ".__len__()"
step "limpeza (204 x3)"
for path in "blocked-slots/$B1" "business-hours/$H1" "business-hours/$H2"; do curl -s -b "$J" -o /dev/null -w "HTTP %{http_code}\n" -X DELETE "$U/admin/$path"; done
rm -f "$J"
