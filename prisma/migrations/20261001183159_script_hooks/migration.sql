-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hooks" TEXT NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Script_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Script" ("content", "createdAt", "id", "model", "topicId", "updatedAt") SELECT "content", "createdAt", "id", "model", "topicId", "updatedAt" FROM "Script";
DROP TABLE "Script";
ALTER TABLE "new_Script" RENAME TO "Script";
CREATE INDEX "Script_topicId_idx" ON "Script"("topicId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
