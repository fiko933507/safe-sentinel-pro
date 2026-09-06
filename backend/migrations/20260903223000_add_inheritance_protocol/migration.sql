-- CreateTable
CREATE TABLE "InheritanceProtocol" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT,
    "network" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "beneficiaryAddress" TEXT NOT NULL,
    "inactivityDays" INTEGER NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "executionStatus" TEXT NOT NULL DEFAULT 'NOT_READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InheritanceProtocol_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InheritanceProtocol_userId_status_idx"
ON "InheritanceProtocol"("userId", "status");

-- CreateIndex
CREATE INDEX "InheritanceProtocol_walletAddress_network_idx"
ON "InheritanceProtocol"("walletAddress", "network");

-- CreateIndex
CREATE INDEX "InheritanceProtocol_beneficiaryAddress_network_idx"
ON "InheritanceProtocol"("beneficiaryAddress", "network");

-- CreateIndex
CREATE INDEX "InheritanceProtocol_status_expiresAt_idx"
ON "InheritanceProtocol"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "InheritanceProtocol"
ADD CONSTRAINT "InheritanceProtocol_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InheritanceProtocol"
ADD CONSTRAINT "InheritanceProtocol_walletId_fkey"
FOREIGN KEY ("walletId") REFERENCES "Wallet"("id")
ON DELETE SET NULL ON UPDATE CASCADE;