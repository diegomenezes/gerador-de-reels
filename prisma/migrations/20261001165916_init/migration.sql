-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "remoteJid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "author" TEXT,
    "text" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "score" REAL NOT NULL DEFAULT 0,
    "dateBucket" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TopicExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicExample_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Script_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "messagesIn" INTEGER NOT NULL DEFAULT 0,
    "messagesKept" INTEGER NOT NULL DEFAULT 0,
    "topicsCreated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_remoteJid_key" ON "Group"("remoteJid");

-- CreateIndex
CREATE INDEX "Message_timestamp_idx" ON "Message"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Message_groupId_waMessageId_key" ON "Message"("groupId", "waMessageId");

-- CreateIndex
CREATE INDEX "Topic_dateBucket_idx" ON "Topic"("dateBucket");

-- CreateIndex
CREATE INDEX "Topic_status_idx" ON "Topic"("status");

-- CreateIndex
CREATE INDEX "Script_topicId_idx" ON "Script"("topicId");
