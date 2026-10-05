-- AlterEnum
ALTER TYPE "CriticFlagType" ADD VALUE 'UnrealisticFinancialAssumption';

-- AlterTable
ALTER TABLE "memo_run" ADD COLUMN     "rnpvOutput" JSONB;
