-- CreateEnum
CREATE TYPE "PatentStatus" AS ENUM ('Granted', 'Pending', 'Expired', 'Abandoned');

-- AlterTable
ALTER TABLE "memo_run" ADD COLUMN     "patentLandscapeLabel" "ClaimLabel",
ADD COLUMN     "patentLandscapeSummary" TEXT;

-- CreateTable
CREATE TABLE "patent" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "citationId" UUID,
    "patentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "applicant" TEXT NOT NULL,
    "filingDate" DATE,
    "publicationDate" DATE,
    "status" "PatentStatus" NOT NULL,
    "relevance" TEXT NOT NULL,
    "label" "ClaimLabel" NOT NULL,

    CONSTRAINT "patent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "patent" ADD CONSTRAINT "patent_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patent" ADD CONSTRAINT "patent_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "citation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
