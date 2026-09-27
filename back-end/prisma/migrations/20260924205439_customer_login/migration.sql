-- Cliente final passa a ter login (e-mail/senha) escopado por estabelecimento.
-- Dados de teste em customers/appointments já foram truncados manualmente
-- antes desta migration (ver conversa), então não há backfill de email/senha.

ALTER TABLE "customers" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "customers" ADD COLUMN "password_hash" TEXT NOT NULL;

CREATE UNIQUE INDEX "customers_establishment_id_email_key" ON "customers"("establishment_id", "email");
