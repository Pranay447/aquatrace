-- Prisma's original timestamps contain UTC wall-clock values. Preserve those
-- instants explicitly, independent of the database server/session timezone.
ALTER TABLE "User" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "Session" ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC';
ALTER TABLE "Sensor" ALTER COLUMN "lastSeen" TYPE TIMESTAMPTZ(3) USING "lastSeen" AT TIME ZONE 'UTC', ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "Reading" ALTER COLUMN "timestamp" TYPE TIMESTAMPTZ(3) USING "timestamp" AT TIME ZONE 'UTC', ALTER COLUMN "receivedAt" TYPE TIMESTAMPTZ(3) USING "receivedAt" AT TIME ZONE 'UTC';
ALTER TABLE "Alert" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC', ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';
ALTER TABLE "AuditLog" ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "RateLimit" ALTER COLUMN "resetAt" TYPE TIMESTAMPTZ(3) USING "resetAt" AT TIME ZONE 'UTC';
