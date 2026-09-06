-- CreateTable
CREATE TABLE "WhitelistAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhitelistAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlacklistAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlacklistAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhitelistAddress_userId_createdAt_idx" ON "WhitelistAddress"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhitelistAddress_userId_address_key" ON "WhitelistAddress"("userId", "address");

-- CreateIndex
CREATE INDEX "BlacklistAddress_userId_createdAt_idx" ON "BlacklistAddress"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlacklistAddress_userId_address_key" ON "BlacklistAddress"("userId", "address");

-- AddForeignKey
ALTER TABLE "WhitelistAddress" ADD CONSTRAINT "WhitelistAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlacklistAddress" ADD CONSTRAINT "BlacklistAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
