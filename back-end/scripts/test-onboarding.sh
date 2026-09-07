#!/usr/bin/env bash
# Teste manual do fluxo de onboarding (login por e-mail/senha -> criar
# estabelecimento -> acessar painel admin). Rode com o servidor no ar:
#
#   npm run dev            # terminal 1
#   bash scripts/test-onboarding.sh   # terminal 2 (Git Bash no Windows)
#
# Pré-requisito: um usuário com passwordHash no banco. Como ainda não há rota
# de cadastro, crie-o com `npx tsx scripts/create-dev-user.ts`.
set -u
U=${BASE_URL:-http://localhost:3333}
EMAIL=${EMAIL:-onboarding-test@example.com}
PASS=${PASS:-senha123}
SLUG=${SLUG:-barbearia-teste}
J=$(mktemp); H="Content-Type: application/json"

step() { echo; echo "== $1 =="; }

step "login (Auth.js Credentials: csrf + callback)"
CSRF=$(curl -s -c "$J" -b "$J" "$U/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
curl -s -c "$J" -b "$J" -o /dev/null -w "HTTP %{http_code} (302 = ok)\n" -X POST "$U/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$EMAIL" --data-urlencode "password=$PASS"
curl -s -b "$J" "$U/auth/session"; echo

step "/admin/services antes do onboarding (esperado 403 ONBOARDING_REQUIRED, ou 200 se já onboardado)"
curl -s -b "$J" -w "\nHTTP %{http_code}\n" "$U/admin/services"

step "slug inválido (esperado 400)"
curl -s -b "$J" -w "\nHTTP %{http_code}\n" -X POST "$U/onboarding/establishment" -H "$H" -d '{"name":"Teste","slug":"Com Espaço!"}'

step "onboarding (esperado 201; 409 ALREADY_ONBOARDED se repetido)"
curl -s -b "$J" -w "\nHTTP %{http_code}\n" -X POST "$U/onboarding/establishment" -H "$H" \
  -d "{\"name\":\"Barbearia Teste\",\"slug\":\"$SLUG\",\"phone\":\"11999990000\"}"

step "/onboarding/status"
curl -s -b "$J" -w "\nHTTP %{http_code}\n" "$U/onboarding/status"

step "/admin/services depois, MESMA sessão (esperado 200)"
curl -s -b "$J" -w "\nHTTP %{http_code}\n" "$U/admin/services"

step "segundo estabelecimento (esperado 409 ALREADY_ONBOARDED)"
curl -s -b "$J" -w "\nHTTP %{http_code}\n" -X POST "$U/onboarding/establishment" -H "$H" -d '{"name":"Outra","slug":"outra-teste"}'

step "sem sessão (esperado 401)"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$U/onboarding/establishment" -H "$H" -d '{"name":"Outra","slug":"outra-teste"}'

rm -f "$J"
