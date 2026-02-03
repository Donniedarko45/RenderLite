import { prisma } from '../lib/prisma.js';

/**
 * Generate a unique subdomain for a service
 */
export async function generateSubdomain(serviceName: string): Promise<string> {
  // Sanitize service name
  const base = serviceName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 20);

  // Generate random suffix
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  let subdomain = `${base}-${randomSuffix}`;

  // Ensure uniqueness
  let exists = await prisma.service.findUnique({
    where: { subdomain },
  });

  let attempts = 0;
  while (exists && attempts < 10) {
    const newSuffix = Math.random().toString(36).substring(2, 8);
    subdomain = `${base}-${newSuffix}`;
    exists = await prisma.service.findUnique({
      where: { subdomain },
    });
    attempts++;
  }

  if (exists) {
    throw new Error('Could not generate unique subdomain');
  }

  return subdomain;
}

/**
 * Get full URL for a service
 */
export function getServiceUrl(subdomain: string): string {
  const baseDomain = process.env.BASE_DOMAIN || 'renderlite.local';
  return `http://${subdomain}.${baseDomain}`;
}
