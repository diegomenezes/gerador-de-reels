-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "groupSource" BOOLEAN NOT NULL DEFAULT true,
    "viralSource" BOOLEAN NOT NULL DEFAULT true,
    "viralTerms" TEXT NOT NULL DEFAULT '{"pt":["impressão 3d"],"en":["3d printing"],"es":["impresión 3d"]}',
    "viralPerSearch" INTEGER NOT NULL DEFAULT 10,
    "viralPlatforms" TEXT NOT NULL DEFAULT 'tiktok,instagram,youtube',
    "ignoreAuthors" TEXT NOT NULL DEFAULT 'primeirasimpressoes.3d',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSettings" ("groupSource", "id", "updatedAt", "viralPerSearch", "viralSource", "viralTerms") SELECT "groupSource", "id", "updatedAt", "viralPerSearch", "viralSource", "viralTerms" FROM "AppSettings";
DROP TABLE "AppSettings";
ALTER TABLE "new_AppSettings" RENAME TO "AppSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

