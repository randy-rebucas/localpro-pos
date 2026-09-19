import prisma from '@/lib/db';

const SETTINGS_ID = 'singleton';

export async function getSystemSettings() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: SETTINGS_ID } });
  return (
    settings ?? {
      id: SETTINGS_ID,
      maintenanceMode: false,
      maintenanceMessage: null,
      updatedById: null,
      updatedAt: null,
    }
  );
}

export async function setMaintenanceMode(
  enabled: boolean,
  message: string | null,
  updatedById: string
) {
  return prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, maintenanceMode: enabled, maintenanceMessage: message, updatedById },
    update: { maintenanceMode: enabled, maintenanceMessage: message, updatedById },
  });
}
