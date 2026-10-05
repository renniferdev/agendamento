import { Link } from "react-router-dom";

/**
 * Conteúdo padrão de Termos de Uso e Política de Privacidade — texto-modelo
 * em português cobrindo dados coletados, finalidade e retenção. PRECISA ser
 * revisado por um profissional jurídico antes de entrar em produção; os
 * campos entre [colchetes] são placeholders para o dono do estabelecimento.
 */

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <Link to="/" className="text-sm text-teal hover:underline">
          ← Voltar
        </Link>
        <h1 className="font-display text-2xl text-ink">{title}</h1>
        <div className="space-y-4 text-sm leading-relaxed text-ink-soft">{children}</div>
      </div>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Política de Privacidade">
      <Notice />

      <Section title="Quais dados coletamos">
        Para permitir o agendamento, coletamos os dados que você informa no cadastro: nome, telefone
        e e-mail. Também registramos a data e o horário dos agendamentos feitos.
      </Section>

      <Section title="Para que usamos esses dados">
        Usamos essas informações apenas para viabilizar o agendamento — identificar você junto ao
        estabelecimento, confirmar horários e enviar e-mails sobre seus agendamentos (confirmação,
        cancelamento). Não usamos seus dados para nenhuma outra finalidade nem os vendemos a terceiros.
      </Section>

      <Section title="Por quanto tempo guardamos">
        Mantemos seus dados enquanto sua conta existir no estabelecimento onde você se cadastrou. Você
        pode pedir a exclusão da sua conta e dos seus dados a qualquer momento, pelo contato abaixo.
      </Section>

      <Section title="Seus direitos">
        Conforme a Lei Geral de Proteção de Dados (LGPD), você pode solicitar a qualquer momento:
        acesso aos seus dados, correção de informações incorretas, e exclusão da sua conta.
      </Section>

      <Section title="Controlador dos dados e contato">
        Os dados coletados neste estabelecimento são de responsabilidade de{" "}
        <strong className="text-ink">RN - Sistemas</strong>, que pode ser contatado em{" "}
        <strong className="text-ink">renniferdev@gmail.com</strong> para qualquer solicitação
        relacionada a esta política.
      </Section>
    </LegalLayout>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalLayout title="Termos de Uso">
      <Notice />

      <Section title="Sobre o serviço">
        Esta plataforma permite que você agende horários com o estabelecimento diretamente pela
        internet. O agendamento é um acordo entre você e o estabelecimento; a plataforma apenas
        viabiliza essa marcação.
      </Section>

      <Section title="Sua conta">
        Você é responsável por manter sua senha em sigilo e por manter seus dados de cadastro
        (nome, telefone, e-mail) atualizados e corretos.
      </Section>

      <Section title="Cancelamentos">
        O estabelecimento pode cancelar um agendamento quando necessário; nesse caso, você recebe um
        e-mail avisando o cancelamento. As condições de cancelamento pelo próprio cliente seguem a
        política de cada estabelecimento.
      </Section>

      <Section title="Limitação de responsabilidade">
        A plataforma é uma ferramenta de agendamento; a prestação do serviço contratado (o horário
        marcado) é de responsabilidade exclusiva do estabelecimento.
      </Section>
    </LegalLayout>
  );
}

function Notice() {
  return (
    <p className="rounded border border-line bg-white p-3 text-xs text-muted">
      Este é um texto-modelo, criado para deixar claro de forma simples quais dados são coletados e
      por quê. Ele não substitui uma revisão jurídica — recomendamos que um profissional de direito
      avalie este conteúdo antes do uso em produção.
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 font-display text-base text-ink">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
