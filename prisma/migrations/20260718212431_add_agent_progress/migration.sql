-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('Queued', 'Running', 'Complete', 'Failed');

-- AlterTable
ALTER TABLE "memo_run" ADD COLUMN     "assessmentStartedAt" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "agent_progress" (
    "id" UUID NOT NULL,
    "memoRunId" UUID NOT NULL,
    "agentName" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'Queued',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "note" TEXT,

    CONSTRAINT "agent_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_progress_memoRunId_agentName_key" ON "agent_progress"("memoRunId", "agentName");

-- AddForeignKey
ALTER TABLE "agent_progress" ADD CONSTRAINT "agent_progress_memoRunId_fkey" FOREIGN KEY ("memoRunId") REFERENCES "memo_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
