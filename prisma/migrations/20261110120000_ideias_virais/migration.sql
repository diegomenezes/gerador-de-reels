-- AlterTable
ALTER TABLE "TopicExample" ADD COLUMN "url" TEXT;

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "groupSource" BOOLEAN NOT NULL DEFAULT true,
    "viralSource" BOOLEAN NOT NULL DEFAULT true,
    "viralTerms" TEXT NOT NULL DEFAULT '{"pt":["impressão 3d"],"en":["3d printing"],"es":["impresión 3d"]}',
    "viralPerSearch" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ViralVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "author" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "running" BOOLEAN NOT NULL DEFAULT true,
    "stage" TEXT NOT NULL DEFAULT 'Iniciando...',
    "messagesIn" INTEGER NOT NULL DEFAULT 0,
    "messagesKept" INTEGER NOT NULL DEFAULT 0,
    "topicsCreated" INTEGER NOT NULL DEFAULT 0,
    "videosIn" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);
INSERT INTO "new_JobRun" ("error", "finishedAt", "id", "messagesIn", "messagesKept", "running", "stage", "startedAt", "success", "topicsCreated") SELECT "error", "finishedAt", "id", "messagesIn", "messagesKept", "running", "stage", "startedAt", "success", "topicsCreated" FROM "JobRun";
DROP TABLE "JobRun";
ALTER TABLE "new_JobRun" RENAME TO "JobRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ViralVideo_fetchedAt_idx" ON "ViralVideo"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ViralVideo_platform_externalId_key" ON "ViralVideo"("platform", "externalId");

