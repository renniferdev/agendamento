#!/usr/bin/env bash
# Teste manual do agendamento público (cliente final). Rode com o backend no
# ar e um usuário JÁ ONBOARDADO com ao menos um serviço ativo. O script cria
# uma janela 09-12 para amanhã, agenda, testa os erros e apaga tudo no final.
#
#   EMAIL=... PASS=... SLUG=... bash scripts/test-booking.sh
set -u
U=${BASE_URL:-http://localhost:3333}; H="Content-Type: application/json"
EMAIL=${EMAIL:?informe EMAIL}; PASS=${PASS:?informe PASS}; SLUG=${SLUG:?informe SLUG do estabelecimento}
J=$(mktemp)
TOMORROW=$(python -c "import datetime as d;print((d.date.today()+d.timedelta(1)).isoformat())")
DOW=$(python -c "import datetime as d;print(((d.date.today()+d.timedelta(1)).weekday()+1)%7)")
step() { echo; echo "== $1 =="; }
json() { python -c "import sys,json;print(json.load(sys.stdin)$1)"; }
book() { # book <startsAt> <phone> [email]
  curl -s -w "\nHTTP %{http_code}" -X POST "$U/establishments/$SLUG/appointments" -H "$H" \
    -d "{\"serviceId\":\"$SVC\",\"customerName\":\"Cliente Teste\",\"customerPhone\":\"$2\",\"customerEmail\":\"${3:-}\",\"startsAt\":\"$1\"}"
}

CSRF=$(curl -s -c "$J" -b "$J" "$U/auth/csrf" | json "['csrfToken']")
curl -s -c "$J" -b "$J" -o /dev/null -X POST "$U/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" --data-urlencode "password=$PASS"
SVC=$(curl -s -b "$J" "$U/admin/services" | json "[0]['id']")
echo "amanhã=$TOMORROW dayOfWeek=$DOW serviço=$SVC"

step "dados públicos do estabelecimento (200, com serviços)"
curl -s -w "\nHTTP %{http_code}\n" "$U/establishments/$SLUG"
step "slug inexistente (404)"; curl -s -o /dev/null -w "HTTP %{http_code}\n" "$U/establishments/nao-existe-$RANDOM"

step "janela 09-12 amanhã (201)"
HB=$(curl -s -b "$J" -X POST "$U/admin/business-hours" -H "$H" -d "{\"dayOfWeek\":$DOW,\"startTime\":\"09:00\",\"endTime\":\"12:00\"}" | json "['id']"); echo "$HB"

step "slots livres"
SLOTS=$(curl -s "$U/establishments/$SLUG/availability?serviceId=$SVC&date=$TOMORROW")
FIRST=$(echo "$SLOTS" | json "['slots'][0]['start']"); SECOND=$(echo "$SLOTS" | json "['slots'][1]['start']"); THIRD=$(echo "$SLOTS" | json "['slots'][2]['start']")
echo "$SLOTS" | json "['slots'].__len__()"; echo "primeiro=$FIRST"

step "agendamento válido (201)"; book "$FIRST" "11999990001" "cliente@example.com"; echo
step "mesmo horário de novo (409 SLOT_UNAVAILABLE)"; book "$FIRST" "11999990002"; echo
step "slot sumiu da disponibilidade (não deve conter o primeiro)"
curl -s "$U/establishments/$SLUG/availability?serviceId=$SVC&date=$TOMORROW" | json "['slots'][0]['start']"
step "fora do horário de funcionamento 20:00 (409)"; book "${TOMORROW}T20:00:00" "11999990003"; echo
step "horário no passado (409)"; book "2020-01-01T09:00:00" "11999990003"; echo
step "horário que não é início de slot, +7min (409)"
OFF=$(python -c "import datetime as d;t=d.datetime.fromisoformat('${SECOND}'.replace('Z','+00:00'))+d.timedelta(minutes=7);print(t.isoformat())")
book "$OFF" "11999990003"; echo
step "telefone inválido (400)"; book "$SECOND" "123"; echo
step "serviço inexistente (404)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$U/establishments/$SLUG/appointments" -H "$H" \
  -d "{\"serviceId\":\"nope\",\"customerName\":\"X Y\",\"customerPhone\":\"11999990003\",\"startsAt\":\"$SECOND\"}"

step "corrida: 6 requisições simultâneas no mesmo slot (esperado: 1x 201, 5x 409)"
for i in 1 2 3 4 5 6; do book "$THIRD" "1199999100$i" | tail -1 & done; wait; echo

step "painel: agendamentos a partir de hoje (esperado 2)"
LIST=$(curl -s -b "$J" "$U/admin/appointments"); echo "$LIST" | json ".__len__()"
A1=$(echo "$LIST" | json "[0]['id']")
step "cancelar o primeiro (200) e slot volta"
curl -s -b "$J" -o /dev/null -w "HTTP %{http_code}\n" -X PATCH "$U/admin/appointments/$A1/cancel"
curl -s "$U/establishments/$SLUG/availability?serviceId=$SVC&date=$TOMORROW" | json "['slots'][0]['start']"
step "cancelar de novo (409)"; curl -s -b "$J" -o /dev/null -w "HTTP %{http_code}\n" -X PATCH "$U/admin/appointments/$A1/cancel"

step "limpeza"
node -e "
const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
(async () => {
  const e = await p.establishment.findUnique({ where: { slug: '$SLUG' } });
  const a = await p.appointment.deleteMany({ where: { establishmentId: e.id, customer: { name: 'Cliente Teste' } } });
  const c = await p.customer.deleteMany({ where: { establishmentId: e.id, name: 'Cliente Teste' } });
  await p.businessHour.delete({ where: { id: '$HB' } });
  console.log('apagados', a.count, 'agendamentos,', c.count, 'clientes, 1 janela');
})().finally(() => p.\$disconnect());
"
rm -f "$J"
