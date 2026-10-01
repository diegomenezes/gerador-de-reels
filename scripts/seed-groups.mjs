import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const groups = [
  ["Primeiras Impressões 3D #1", "120363405756239332@g.us"],
  ["Primeiras Impressões 3D #2", "120363425485987212@g.us"],
  ["Primeiras Impressões 3D #3", "120363429644734460@g.us"],
  ["Primeiras Impressões 3D #4", "120363411579923447@g.us"],
];

for (const [name, remoteJid] of groups) {
  const g = await prisma.group.upsert({
    where: { remoteJid },
    create: { name, remoteJid, active: true },
    update: { name, active: true },
  });
  console.log(`${g.name} => ${g.remoteJid}`);
}

await prisma.$disconnect();
