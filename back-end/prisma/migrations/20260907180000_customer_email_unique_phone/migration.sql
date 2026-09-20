-- DropIndex
DROP INDEX "customers_establishment_id_phone_idx";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_establishment_id_phone_key" ON "customers"("establishment_id", "phone");

