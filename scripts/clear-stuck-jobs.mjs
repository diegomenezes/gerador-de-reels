import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const result = await prisma.jobRun.updateMany({
  where: { running: true },
  data: {
    running: false,
    success: false,
    stage: "Interrompido",
    finishedAt: new Date(),
    error: "Job interrompido (servidor reiniciado ou timeout).",
  },
});
console.log("cleared", result.count);
await prisma.$disconnect();
