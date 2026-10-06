-- CreateTable
CREATE TABLE "ModerationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "deleteMode" BOOLEAN NOT NULL DEFAULT false,
    "notifyNumber" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BlockedDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WhitelistLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdminLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "urlKey" TEXT NOT NULL,
    "sample" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ModerationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupJid" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "matchedUrl" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "messageAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockedDomain_domain_key" ON "BlockedDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "WhitelistLink_url_key" ON "WhitelistLink"("url");

-- CreateIndex
CREATE UNIQUE INDEX "AdminLink_urlKey_key" ON "AdminLink"("urlKey");

-- CreateIndex
CREATE INDEX "AdminLink_expiresAt_idx" ON "AdminLink"("expiresAt");

-- CreateIndex
CREATE INDEX "ModerationEvent_createdAt_idx" ON "ModerationEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationEvent_groupJid_waMessageId_key" ON "ModerationEvent"("groupJid", "waMessageId");
