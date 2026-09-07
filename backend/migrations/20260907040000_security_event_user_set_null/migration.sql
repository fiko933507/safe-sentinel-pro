ALTER TABLE "SecurityEvent"
DROP CONSTRAINT IF EXISTS "SecurityEvent_userId_fkey";

ALTER TABLE "SecurityEvent"
ADD CONSTRAINT "SecurityEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
