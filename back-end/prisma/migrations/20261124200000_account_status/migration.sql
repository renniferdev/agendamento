-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- AlterTable: contas já existentes continuam liberadas (ACTIVE)...
ALTER TABLE "users" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

-- ...e as novas passam a nascer PENDING (aguardando liberação do dono da plataforma).
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'PENDING';
