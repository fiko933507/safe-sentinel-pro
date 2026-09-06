CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "eventKey" TEXT,
    "asset" TEXT,
    "network" TEXT,
    "resourceId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_eventKey_key"
ON "Notification"("eventKey");

CREATE INDEX "Notification_userId_createdAt_idx"
ON "Notification"("userId", "createdAt");

CREATE INDEX "Notification_userId_read_createdAt_idx"
ON "Notification"("userId", "read", "createdAt");

CREATE INDEX "Notification_userId_type_createdAt_idx"
ON "Notification"("userId", "type", "createdAt");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;