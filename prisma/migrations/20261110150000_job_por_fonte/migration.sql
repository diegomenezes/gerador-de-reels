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
    "mode" TEXT NOT NULL DEFAULT 'daily',
    "error" TEXT
);
INSERT INTO "new_JobRun" ("error", "finishedAt", "id", "messagesIn", "messagesKept", "running", "stage", "startedAt", "success", "topicsCreated", "videosIn") SELECT "error", "finishedAt", "id", "messagesIn", "messagesKept", "running", "stage", "startedAt", "success", "topicsCreated", "videosIn" FROM "JobRun";
DROP TABLE "JobRun";
ALTER TABLE "new_JobRun" RENAME TO "JobRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

