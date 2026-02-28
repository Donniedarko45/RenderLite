import { prisma } from '../lib/prisma.js';

/**
 * Generate a unique subdomain for a service
 */
export async function generateSubdomain(serviceName: string): Promise<string> {
  const base = serviceName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 20);

  const randomSuffix = Math.random().toString(36).substring(2, 8);
  let subdomain = `${base}-${randomSuffix}`;

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
 * Get full URL for a service, respecting TLS configuration
 */
export function getServiceUrl(subdomain: string): string {
  const baseDomain = process.env.BASE_DOMAIN || 'renderlite.local';
  const protocol = process.env.ENABLE_TLS === 'true' ? 'https' : 'http';
  return `${protocol}://${subdomain}.${baseDomain}`;
}
