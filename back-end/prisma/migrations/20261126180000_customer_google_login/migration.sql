-- Cliente final pode entrar com Google: sem senha, identificado pelo `sub`.
ALTER TABLE "customers" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "customers" ADD COLUMN "google_sub" TEXT;

CREATE UNIQUE INDEX "customers_establishment_id_google_sub_key" ON "customers"("establishment_id", "google_sub");
