-- Cliente marcado pelo dono (telefone/balcao) pode nao ter e-mail.
ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;

-- Quando um cliente criado pelo dono passa a ter conta propria.
ALTER TABLE "customers" ADD COLUMN "claimed_at" TIMESTAMP(3);
