// Teste de carga do fluxo de agendamento: abrir a página, consultar horários e
// reservar. Simula clientes de 7 lojas ao mesmo tempo.
//
//   # 1) API apontando para o banco de TESTE, com o mesmo segredo do seed:
//   DATABASE_URL=<banco de teste> CUSTOMER_JWT_SECRET=carga-local \
//   NEXTAUTH_SECRET=x PORT=3334 npx tsx src/server.ts
//   # 2) k6 (https://k6.io) ou via Docker:
//   k6 run scripts/load/k6-agendamento.js
//   docker run --rm -i -v "$PWD/scripts/load:/load" -e BASE_URL=http://host.docker.internal:3334 \
//     grafana/k6 run /load/k6-agendamento.js
//
// 409 (horário já tomado) é resposta ESPERADA: com muita gente disputando, só
// um leva cada horário. O que não pode aparecer é erro 5xx nem lentidão.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3334";
const tenants = JSON.parse(open("./tokens.json"));

const reservasOk = new Counter("reservas_criadas");
const conflitos = new Counter("reservas_conflito_409");
const erros5xx = new Rate("erros_5xx");

export const options = {
  stages: [
    { duration: "20s", target: 20 },
    { duration: "40s", target: 50 },
    { duration: "20s", target: 0 },
  ],
  thresholds: {
    erros_5xx: ["rate==0"],
    "http_req_duration{tipo:leitura}": ["p(95)<800"],
    "http_req_duration{tipo:reserva}": ["p(95)<2000"],
    checks: ["rate>0.99"],
  },
};

function proximoDiaUtil() {
  const d = new Date();
  d.setDate(d.getDate() + 1 + Math.floor(Math.random() * 14));
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // loja fecha no domingo
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function () {
  const tenant = tenants[(__VU - 1) % tenants.length];
  const token = tenant.tokens[Math.floor(Math.random() * tenant.tokens.length)];
  const base = `${BASE_URL}/establishments/${tenant.slug}`;

  const pagina = http.get(base, { tags: { tipo: "leitura" } });
  erros5xx.add(pagina.status >= 500);
  check(pagina, { "página da loja abre": (r) => r.status === 200 });

  const data = proximoDiaUtil();
  const horarios = http.get(`${base}/availability?serviceId=${tenant.serviceId}&date=${data}`, {
    tags: { tipo: "leitura" },
  });
  erros5xx.add(horarios.status >= 500);
  check(horarios, { "consulta de horários responde": (r) => r.status === 200 });

  const slots = horarios.status === 200 ? horarios.json("slots") || [] : [];
  if (slots.length > 0) {
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const reserva = http.post(
      `${base}/appointments`,
      JSON.stringify({ serviceId: tenant.serviceId, startsAt: slot.start }),
      {
        headers: { "Content-Type": "application/json", Cookie: `customer_session=${token}` },
        tags: { tipo: "reserva" },
      }
    );
    erros5xx.add(reserva.status >= 500);
    check(reserva, { "reserva aceita ou conflito esperado": (r) => r.status === 201 || r.status === 409 });
    if (reserva.status === 201) reservasOk.add(1);
    if (reserva.status === 409) conflitos.add(1);
  }

  sleep(1 + Math.random() * 2);
}
