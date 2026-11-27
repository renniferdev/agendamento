import { Resend } from "resend";

/**
 * Remetente dos e-mails. Sem domínio verificado no Resend, o único remetente
 * aceito é `onboarding@resend.dev` — e nesse modo o Resend só entrega para o
 * e-mail do dono da conta (qualquer outro destinatário responde 403 e o erro
 * vai para o log). Em produção, verificar o domínio e definir EMAIL_FROM.
 */
const EMAIL_FROM = process.env.EMAIL_FROM ?? "Agendamento <onboarding@resend.dev>";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface AppointmentEmailData {
  establishmentName: string;
  establishmentPhone: string | null;
  serviceName: string;
  priceCents: number;
  startsAt: Date;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  adminEmail: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPhone(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY ausente; e-mail "${subject}" para ${to} não enviado.`);
    return;
  }
  const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
  if (error) throw new Error(`${error.name}: ${error.message}`);
}

/**
 * Dispara a confirmação para o cliente e o aviso para o admin. Nunca lança:
 * o agendamento já está salvo quando isto roda, e falha de e-mail não pode
 * virar erro para o cliente final — só log.
 */
export async function sendAppointmentEmails(data: AppointmentEmailData): Promise<void> {
  const when = dateTimeFmt.format(data.startsAt);
  const est = escapeHtml(data.establishmentName);
  const service = escapeHtml(data.serviceName);
  const customer = escapeHtml(data.customerName);

  const jobs: Promise<void>[] = [];

  if (data.customerEmail) {
    jobs.push(
      send(
        data.customerEmail,
        `Agendamento confirmado — ${data.establishmentName}`,
        `<p>Olá, ${customer}!</p>
         <p>Seu agendamento em <strong>${est}</strong> está confirmado:</p>
         <ul>
           <li><strong>Serviço:</strong> ${service} (${brl.format(data.priceCents / 100)})</li>
           <li><strong>Quando:</strong> ${when}</li>
         </ul>
         ${data.establishmentPhone ? `<p>Dúvidas? Fale com o estabelecimento: ${escapeHtml(data.establishmentPhone)}</p>` : ""}`
      )
    );
  }

  if (data.adminEmail) {
    jobs.push(
      send(
        data.adminEmail,
        `Novo agendamento: ${data.customerName} — ${when}`,
        `<p>Um cliente acabou de agendar em <strong>${est}</strong>.</p>
         <ul>
           <li><strong>Cliente:</strong> ${customer} — ${formatPhone(data.customerPhone)}${
             data.customerEmail ? ` — ${escapeHtml(data.customerEmail)}` : ""
           }</li>
           <li><strong>Serviço:</strong> ${service}</li>
           <li><strong>Quando:</strong> ${when}</li>
         </ul>`
      )
    );
  }

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") console.error("[email] falha ao enviar:", r.reason);
  }
}

/**
 * Avisa o cliente que o estabelecimento cancelou o agendamento. Chamado
 * depois que o cancelamento já foi salvo — falha de envio não deve reverter
 * nem bloquear a resposta ao admin (mesma convenção de sendAppointmentEmails).
 */
export async function sendCancellationEmail(data: {
  to: string;
  establishmentName: string;
  establishmentPhone: string | null;
  serviceName: string;
  startsAt: Date;
}): Promise<void> {
  const when = dateTimeFmt.format(data.startsAt);
  await send(
    data.to,
    `Agendamento cancelado — ${data.establishmentName}`,
    `<p>Seu agendamento em <strong>${escapeHtml(data.establishmentName)}</strong> foi cancelado:</p>
     <ul>
       <li><strong>Serviço:</strong> ${escapeHtml(data.serviceName)}</li>
       <li><strong>Quando:</strong> ${when}</li>
     </ul>
     ${data.establishmentPhone ? `<p>Dúvidas? Fale com o estabelecimento: ${escapeHtml(data.establishmentPhone)}</p>` : ""}`
  );
}

/** Avisa o dono de que o próprio cliente cancelou um horário. */
export async function sendCustomerCancelledEmail(data: {
  to: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  startsAt: Date;
}): Promise<void> {
  const when = dateTimeFmt.format(data.startsAt);
  await send(
    data.to,
    `Horário cancelado pelo cliente: ${data.customerName}`,
    `<p>Um cliente cancelou um agendamento. O horário voltou a ficar disponível.</p>
     <ul>
       <li><strong>Cliente:</strong> ${escapeHtml(data.customerName)} (${escapeHtml(data.customerPhone)})</li>
       <li><strong>Serviço:</strong> ${escapeHtml(data.serviceName)}</li>
       <li><strong>Quando era:</strong> ${when}</li>
     </ul>`
  );
}

/** Link de "esqueci minha senha", usado tanto pelo admin quanto pelo cliente final. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await send(
    to,
    "Redefinição de senha",
    `<p>Recebemos um pedido para redefinir sua senha.</p>
     <p><a href="${resetUrl}">Clique aqui para escolher uma nova senha</a>. O link expira em 1 hora.</p>
     <p>Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>`
  );
}
