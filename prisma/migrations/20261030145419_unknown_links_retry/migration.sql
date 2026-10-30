-- CreateTable
CREATE TABLE "AllowedDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UnknownLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "sample" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastMessageId" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ModerationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupJid" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT '',
    "authorPhone" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "matchedUrl" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "participant" TEXT NOT NULL DEFAULT '',
    "participantAlt" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "messageAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ModerationEvent" ("action", "author", "authorName", "authorPhone", "createdAt", "detail", "groupJid", "groupName", "id", "matchedUrl", "messageAt", "text", "waMessageId") SELECT "action", "author", "authorName", "authorPhone", "createdAt", "detail", "groupJid", "groupName", "id", "matchedUrl", "messageAt", "text", "waMessageId" FROM "ModerationEvent";
DROP TABLE "ModerationEvent";
ALTER TABLE "new_ModerationEvent" RENAME TO "ModerationEvent";
CREATE INDEX "ModerationEvent_createdAt_idx" ON "ModerationEvent"("createdAt");
CREATE INDEX "ModerationEvent_action_nextAttemptAt_idx" ON "ModerationEvent"("action", "nextAttemptAt");
CREATE UNIQUE INDEX "ModerationEvent_groupJid_waMessageId_key" ON "ModerationEvent"("groupJid", "waMessageId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AllowedDomain_domain_key" ON "AllowedDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "UnknownLink_domain_key" ON "UnknownLink"("domain");

-- CreateIndex
CREATE INDEX "UnknownLink_lastSeenAt_idx" ON "UnknownLink"("lastSeenAt");
