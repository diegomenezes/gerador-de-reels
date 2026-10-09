-- AlterTable
ALTER TABLE "ModerationSettings" ADD COLUMN "announceDelete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ModerationSettings" ADD COLUMN "announceText" TEXT NOT NULL DEFAULT '*Mensagem apagada automaticamente* pelo BOT Moderador. Se você acha que foi um engano comunique um dos admins, leia as regras do grupo na descrição.';
