-- CreateEnum
CREATE TYPE "Status" AS ENUM ('PENDING', 'BROADCAST', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "Disbursement" (
    "id" TEXT NOT NULL,
    "recipientAlias" TEXT NOT NULL,
    "stealthAddress" TEXT NOT NULL,
    "ephemeralPubKey" TEXT NOT NULL,
    "amountSats" BIGINT NOT NULL,
    "txHash" TEXT,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Disbursement_stealthAddress_key" ON "Disbursement"("stealthAddress");
