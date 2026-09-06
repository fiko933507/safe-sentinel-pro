-- DropIndex
DROP INDEX "BlacklistAddress_userId_address_key";

-- DropIndex
DROP INDEX "WhitelistAddress_userId_address_key";

-- AlterTable
ALTER TABLE "BlacklistAddress" ADD COLUMN "network" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "WhitelistAddress" ADD COLUMN "network" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BlacklistAddress_userId_network_address_key" ON "BlacklistAddress"("userId", "network", "address");

-- CreateIndex
CREATE UNIQUE INDEX "WhitelistAddress_userId_network_address_key" ON "WhitelistAddress"("userId", "network", "address");
