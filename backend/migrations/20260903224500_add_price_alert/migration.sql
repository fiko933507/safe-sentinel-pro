CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "targetPrice" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ABOVE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "triggeredAt" TIMESTAMP(3),
    "lastPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceAlert_userId_enabled_idx"
ON "PriceAlert"("userId", "enabled");

CREATE INDEX "PriceAlert_network_asset_enabled_idx"
ON "PriceAlert"("network", "asset", "enabled");

CREATE INDEX "PriceAlert_userId_createdAt_idx"
ON "PriceAlert"("userId", "createdAt");

ALTER TABLE "PriceAlert"
ADD CONSTRAINT "PriceAlert_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;