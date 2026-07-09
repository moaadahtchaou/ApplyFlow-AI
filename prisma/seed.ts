import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.activityLog.deleteMany();
  await prisma.generatedMessage.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.leadSearch.deleteMany();
  await prisma.company.deleteMany();
  await prisma.emailTemplate.deleteMany();
  await prisma.userSettings.deleteMany();

  await prisma.userSettings.create({
    data: {
      singletonKey: 'default',
      defaultTone: 'professional',
      defaultLanguage: 'English',
      aiProvider: 'mock'
    }
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
