-- CreateEnum
CREATE TYPE "HearingState" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('PARTY', 'COUNSEL', 'WITNESS', 'OTHER');

-- CreateEnum
CREATE TYPE "JudgeRole" AS ENUM ('JUDGE', 'PRESIDING_JUDGE', 'SECRETARY', 'OTHER_OFFICER');

-- CreateEnum
CREATE TYPE "RemapTargetType" AS ENUM ('EXISTING_PARTY', 'NEW_PARTY');

-- CreateTable
CREATE TABLE "Hearing" (
    "id" TEXT NOT NULL,
    "hearingNumber" INTEGER NOT NULL,
    "state" "HearingState" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HearingPeriod" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "HearingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpectedParty" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL DEFAULT 'PARTY',

    CONSTRAINT "ExpectedParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemapMapping" (
    "id" TEXT NOT NULL,
    "rosterEmail" TEXT NOT NULL,
    "mappedToType" "RemapTargetType" NOT NULL,
    "mappedToExpectedPartyId" TEXT,
    "newPartyName" TEXT,
    "hearingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "RemapMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeOrAuxiliary" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "JudgeRole" NOT NULL,

    CONSTRAINT "JudgeOrAuxiliary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "hearingId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hearing_hearingNumber_key" ON "Hearing"("hearingNumber");

-- CreateIndex
CREATE INDEX "HearingPeriod_hearingId_idx" ON "HearingPeriod"("hearingId");

-- CreateIndex
CREATE INDEX "ExpectedParty_hearingId_idx" ON "ExpectedParty"("hearingId");

-- CreateIndex
CREATE INDEX "ExpectedParty_email_idx" ON "ExpectedParty"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_email_key" ON "RosterEntry"("email");

-- CreateIndex
CREATE INDEX "RemapMapping_hearingId_idx" ON "RemapMapping"("hearingId");

-- CreateIndex
CREATE INDEX "RemapMapping_rosterEmail_idx" ON "RemapMapping"("rosterEmail");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeOrAuxiliary_email_key" ON "JudgeOrAuxiliary"("email");

-- CreateIndex
CREATE INDEX "AuditLogEntry_hearingId_idx" ON "AuditLogEntry"("hearingId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "HearingPeriod" ADD CONSTRAINT "HearingPeriod_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpectedParty" ADD CONSTRAINT "ExpectedParty_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemapMapping" ADD CONSTRAINT "RemapMapping_mappedToExpectedPartyId_fkey" FOREIGN KEY ("mappedToExpectedPartyId") REFERENCES "ExpectedParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemapMapping" ADD CONSTRAINT "RemapMapping_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
