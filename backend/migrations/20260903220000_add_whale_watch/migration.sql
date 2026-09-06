-- CreateTable
CREATE TABLE "WhaleWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "lastSeenTxid" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhaleWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhaleWatch_userId_network_address_key"
ON "WhaleWatch"("userId", "network", "address");

-- CreateIndex
CREATE INDEX "WhaleWatch_userId_createdAt_idx"
ON "WhaleWatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WhaleWatch_network_address_idx"
ON "WhaleWatch"("network", "address");

-- AddForeignKey
ALTER TABLE "WhaleWatch"
ADD CONSTRAINT "WhaleWatch_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;