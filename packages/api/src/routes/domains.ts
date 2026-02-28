import { Router } from 'express';
import dns from 'dns';
import { promisify } from 'util';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

const resolveTxt = promisify(dns.resolveTxt);

export const domainRouter = Router();

domainRouter.use(authenticate);

// List domains for a service
domainRouter.get('/service/:serviceId', async (req: AuthRequest, res, next) => {
  try {
    const service = await prisma.service.findFirst({
      where: {
        id: req.params.serviceId,
        project: { userId: req.user!.id },
      },
    });

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    const domains = await prisma.domain.findMany({
      where: { serviceId: service.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(domains);
  } catch (error) {
    next(error);
  }
});

// Add a custom domain
domainRouter.post('/service/:serviceId', async (req: AuthRequest, res, next) => {
  try {
    const { hostname } = req.body;

    if (!hostname || typeof hostname !== 'string') {
      throw new AppError('hostname is required', 400);
    }

    const normalizedHostname = hostname.toLowerCase().trim();

    const domainPattern = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
    if (!domainPattern.test(normalizedHostname)) {
      throw new AppError('Invalid domain name', 400);
    }

    const service = await prisma.service.findFirst({
      where: {
        id: req.params.serviceId,
        project: { userId: req.user!.id },
      },
    });

    if (!service) {
      throw new AppError('Service not found', 404);
    }

    const existing = await prisma.domain.findUnique({
      where: { hostname: normalizedHostname },
    });
    if (existing) {
      throw new AppError('Domain is already in use', 409);
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const domain = await prisma.domain.create({
      data: {
        serviceId: service.id,
        hostname: normalizedHostname,
        verificationToken,
      },
    });

    res.status(201).json({
      ...domain,
      dnsInstruction: `Add a TXT record for _renderlite-verify.${normalizedHostname} with value: ${verificationToken}`,
    });
  } catch (error) {
    next(error);
  }
});

// Verify a domain's DNS TXT record
domainRouter.post('/:id/verify', async (req: AuthRequest, res, next) => {
  try {
    const domain = await prisma.domain.findFirst({
      where: {
        id: req.params.id,
        service: {
          project: { userId: req.user!.id },
        },
      },
    });

    if (!domain) {
      throw new AppError('Domain not found', 404);
    }

    if (domain.verified) {
      return res.json({ verified: true, message: 'Domain already verified' });
    }

    const txtHost = `_renderlite-verify.${domain.hostname}`;

    try {
      const records = await resolveTxt(txtHost);
      const flatRecords = records.map((r) => r.join(''));
      const found = flatRecords.includes(domain.verificationToken);

      if (!found) {
        return res.json({
          verified: false,
          message: `TXT record not found. Add a TXT record for ${txtHost} with value: ${domain.verificationToken}`,
        });
      }
    } catch (dnsError: any) {
      if (dnsError.code === 'ENODATA' || dnsError.code === 'ENOTFOUND') {
        return res.json({
          verified: false,
          message: `No TXT record found at ${txtHost}`,
        });
      }
      throw dnsError;
    }

    await prisma.domain.update({
      where: { id: domain.id },
      data: { verified: true },
    });

    res.json({ verified: true, message: 'Domain verified successfully' });
  } catch (error) {
    next(error);
  }
});

// Delete a domain
domainRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const domain = await prisma.domain.findFirst({
      where: {
        id: req.params.id,
        service: {
          project: { userId: req.user!.id },
        },
      },
    });

    if (!domain) {
      throw new AppError('Domain not found', 404);
    }

    await prisma.domain.delete({
      where: { id: domain.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
