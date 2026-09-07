-- Security core tables that existed in the Prisma schema but were missing
-- from the migration history. This migration makes fresh production
-- deployments reproducible.

CREATE TABLE IF NOT EXISTS "GuardianProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "alertThresholdUsd" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "minimumRiskScore" INTEGER NOT NULL DEFAULT 60,
    "blockKnownScam" BOOLEAN NOT NULL DEFAULT true,
    "warnUnknownCounterparty" BOOLEAN NOT NULL DEFAULT true,
    "monitorBehavior" BOOLEAN NOT NULL DEFAULT true,
    "monitorScamDna" BOOLEAN NOT NULL DEFAULT true,
    "monitorSecurityGraph" BOOLEAN NOT NULL DEFAULT true,
    "monitorEarlyWarning" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuardianProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuardianProfile_userId_key" ON "GuardianProfile"("userId");
CREATE INDEX IF NOT EXISTS "GuardianProfile_enabled_idx" ON "GuardianProfile"("enabled");
ALTER TABLE "GuardianProfile" ADD CONSTRAINT "GuardianProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ScamAddress" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "source" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "severity" INTEGER NOT NULL DEFAULT 50,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScamAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScamAddress_network_address_key" ON "ScamAddress"("network", "address");
CREATE INDEX IF NOT EXISTS "ScamAddress_network_address_idx" ON "ScamAddress"("network", "address");
CREATE INDEX IF NOT EXISTS "ScamAddress_category_idx" ON "ScamAddress"("category");
CREATE INDEX IF NOT EXISTS "ScamAddress_active_idx" ON "ScamAddress"("active");

CREATE TABLE IF NOT EXISTS "ScamEvidence" (
    "id" TEXT NOT NULL,
    "scamAddressId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "observedAddress" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "txid" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScamEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScamEvidence_observedAddress_idx" ON "ScamEvidence"("observedAddress");
CREATE INDEX IF NOT EXISTS "ScamEvidence_network_observedAddress_idx" ON "ScamEvidence"("network", "observedAddress");
CREATE INDEX IF NOT EXISTS "ScamEvidence_txid_idx" ON "ScamEvidence"("txid");
ALTER TABLE "ScamEvidence" ADD CONSTRAINT "ScamEvidence_scamAddressId_fkey" FOREIGN KEY ("scamAddressId") REFERENCES "ScamAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SecurityAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "token" TEXT,
    "counterparty" TEXT NOT NULL,
    "scamAddressId" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SecurityAlert_userId_createdAt_idx" ON "SecurityAlert"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityAlert_walletId_createdAt_idx" ON "SecurityAlert"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityAlert_network_walletAddress_idx" ON "SecurityAlert"("network", "walletAddress");
CREATE INDEX IF NOT EXISTS "SecurityAlert_transactionId_idx" ON "SecurityAlert"("transactionId");
CREATE INDEX IF NOT EXISTS "SecurityAlert_counterparty_idx" ON "SecurityAlert"("counterparty");
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "SecurityAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "SecurityAlert_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityAlert" ADD CONSTRAINT "SecurityAlert_scamAddressId_fkey" FOREIGN KEY ("scamAddressId") REFERENCES "ScamAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "AuthSession" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_jti_key" ON "AuthSession"("jti");
CREATE INDEX IF NOT EXISTS "AuthSession_userId_createdAt_idx" ON "AuthSession"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_eventType_createdAt_idx" ON "SecurityEvent"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_severity_createdAt_idx" ON "SecurityEvent"("severity", "createdAt");
CREATE INDEX IF NOT EXISTS "SecurityEvent_ipAddress_createdAt_idx" ON "SecurityEvent"("ipAddress", "createdAt");
