import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const discarded = await prisma.topic.findMany({
  where: { status: "discarded" },
  select: { id: true, title: true },
});

console.log("Descartados encontrados:", discarded.length);
for (const t of discarded) {
  console.log("-", t.title);
}

const result = await prisma.topic.deleteMany({
  where: { status: "discarded" },
});

console.log("Removidos:", result.count);
await prisma.$disconnect();
