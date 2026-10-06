-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "score" REAL NOT NULL DEFAULT 0,
    "dateBucket" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "kind" TEXT NOT NULL DEFAULT 'question',
    "userNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Topic" ("createdAt", "dateBucket", "frequency", "id", "score", "status", "summary", "title", "updatedAt", "userNotes") SELECT "createdAt", "dateBucket", "frequency", "id", "score", "status", "summary", "title", "updatedAt", "userNotes" FROM "Topic";
DROP TABLE "Topic";
ALTER TABLE "new_Topic" RENAME TO "Topic";
CREATE INDEX "Topic_dateBucket_idx" ON "Topic"("dateBucket");
CREATE INDEX "Topic_status_idx" ON "Topic"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
