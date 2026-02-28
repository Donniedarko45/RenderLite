import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { DatabaseType, DATABASE_IMAGES, DOCKER_NETWORK } from '@renderlite/shared';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export const databaseRouter = Router();

databaseRouter.use(authenticate);

function generateCredentials() {
  return {
    username: 'renderlite',
    password: crypto.randomBytes(16).toString('hex'),
    dbName: 'renderlite_db',
  };
}

// List databases for current user
databaseRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { projectId } = req.query;

    const databases = await prisma.managedDatabase.findMany({
      where: {
        project: {
          userId: req.user!.id,
          ...(projectId && { id: projectId as string }),
        },
      },
      include: {
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      databases.map((db) => ({
        ...db,
        password: db.password ? '********' : null,
      }))
    );
  } catch (error) {
    next(error);
  }
});

// Get database detail (includes connection info)
databaseRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const db = await prisma.managedDatabase.findFirst({
      where: {
        id: req.params.id,
        project: { userId: req.user!.id },
      },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    if (!db) {
      throw new AppError('Database not found', 404);
    }

    let password: string | null = null;
    if (db.password) {
      try {
        password = decrypt(db.password);
      } catch {
        password = null;
      }
    }

    let connectionString: string | null = null;
    if (db.host && db.port && db.status === 'RUNNING') {
      if (db.type === 'POSTGRES') {
        connectionString = `postgresql://${db.username}:${password}@${db.host}:${db.port}/${db.dbName}`;
      } else if (db.type === 'MYSQL') {
        connectionString = `mysql://${db.username}:${password}@${db.host}:${db.port}/${db.dbName}`;
      } else if (db.type === 'REDIS') {
        connectionString = `redis://${db.host}:${db.port}`;
      }
    }

    res.json({
      ...db,
      password: password ? '********' : null,
      connectionString,
    });
  } catch (error) {
    next(error);
  }
});

// Provision a new managed database
databaseRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { name, projectId, type } = req.body;

    if (!name || !projectId || !type) {
      throw new AppError('name, projectId, and type are required', 400);
    }

    if (!Object.values(DatabaseType).includes(type)) {
      throw new AppError(`Invalid database type. Must be one of: ${Object.values(DatabaseType).join(', ')}`, 400);
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user!.id },
    });
    if (!project) {
      throw new AppError('Project not found', 404);
    }

    const dbConfig = DATABASE_IMAGES[type];
    if (!dbConfig) {
      throw new AppError('Unsupported database type', 400);
    }

    const creds = generateCredentials();
    const containerName = `renderlite-db-${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
    const volumeName = `renderlite-dbvol-${containerName}`;

    const db = await prisma.managedDatabase.create({
      data: {
        name: name.trim(),
        projectId,
        type: type as any,
        status: 'PROVISIONING',
        host: containerName,
        port: dbConfig.port,
        dbName: creds.dbName,
        username: creds.username,
        password: encrypt(creds.password),
        volumeName,
      },
    });

    // Provision container in background
    provisionDatabaseContainer(db.id, containerName, volumeName, type, dbConfig, creds)
      .catch((err) => console.error(`Failed to provision database ${db.id}:`, err));

    res.status(201).json({
      ...db,
      password: '********',
    });
  } catch (error) {
    next(error);
  }
});

async function provisionDatabaseContainer(
  dbId: string,
  containerName: string,
  volumeName: string,
  type: string,
  config: { image: string; port: number; healthCmd: string[] },
  creds: { username: string; password: string; dbName: string }
): Promise<void> {
  try {
    const envArray: string[] = [];

    if (type === 'POSTGRES') {
      envArray.push(
        `POSTGRES_USER=${creds.username}`,
        `POSTGRES_PASSWORD=${creds.password}`,
        `POSTGRES_DB=${creds.dbName}`
      );
    } else if (type === 'MYSQL') {
      envArray.push(
        `MYSQL_USER=${creds.username}`,
        `MYSQL_PASSWORD=${creds.password}`,
        `MYSQL_DATABASE=${creds.dbName}`,
        `MYSQL_ROOT_PASSWORD=${creds.password}`
      );
    }

    let dataPath = '/data';
    if (type === 'POSTGRES') dataPath = '/var/lib/postgresql/data';
    else if (type === 'MYSQL') dataPath = '/var/lib/mysql';

    const container = await docker.createContainer({
      Image: config.image,
      name: containerName,
      Env: envArray,
      Labels: {
        'renderlite.managed': 'true',
        'renderlite.managed-db': 'true',
        'renderlite.db-id': dbId,
      },
      HostConfig: {
        NetworkMode: DOCKER_NETWORK,
        RestartPolicy: { Name: 'unless-stopped' },
        Memory: 256 * 1024 * 1024,
        NanoCpus: 250000000,
        Binds: [`${volumeName}:${dataPath}`],
      },
      Healthcheck: {
        Test: config.healthCmd,
        Interval: 10 * 1e9,
        Timeout: 5 * 1e9,
        Retries: 5,
      },
    });

    await container.start();

    await prisma.managedDatabase.update({
      where: { id: dbId },
      data: {
        status: 'RUNNING',
        containerId: container.id,
      },
    });
  } catch (error) {
    await prisma.managedDatabase.update({
      where: { id: dbId },
      data: { status: 'FAILED' },
    });
    throw error;
  }
}

// Delete a managed database
databaseRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const db = await prisma.managedDatabase.findFirst({
      where: {
        id: req.params.id,
        project: { userId: req.user!.id },
      },
    });

    if (!db) {
      throw new AppError('Database not found', 404);
    }

    if (db.containerId) {
      try {
        const container = docker.getContainer(db.containerId);
        try { await container.stop({ t: 10 }); } catch { /* already stopped */ }
        await container.remove({ force: true });
      } catch (err: any) {
        if (err?.statusCode !== 404) {
          console.error(`Failed to remove database container: ${err.message}`);
        }
      }
    }

    await prisma.managedDatabase.delete({ where: { id: db.id } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Link a database to a service (inject connection env vars)
databaseRouter.post('/:id/link/:serviceId', async (req: AuthRequest, res, next) => {
  try {
    const db = await prisma.managedDatabase.findFirst({
      where: {
        id: req.params.id,
        project: { userId: req.user!.id },
      },
    });

    if (!db) {
      throw new AppError('Database not found', 404);
    }

    if (db.status !== 'RUNNING') {
      throw new AppError('Database is not running', 400);
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

    let password: string | null = null;
    if (db.password) {
      try { password = decrypt(db.password); } catch { /* ignore */ }
    }

    let connectionString = '';
    let envKey = 'DATABASE_URL';

    if (db.type === 'POSTGRES') {
      connectionString = `postgresql://${db.username}:${password}@${db.host}:${db.port}/${db.dbName}`;
      envKey = 'DATABASE_URL';
    } else if (db.type === 'MYSQL') {
      connectionString = `mysql://${db.username}:${password}@${db.host}:${db.port}/${db.dbName}`;
      envKey = 'DATABASE_URL';
    } else if (db.type === 'REDIS') {
      connectionString = `redis://${db.host}:${db.port}`;
      envKey = 'REDIS_URL';
    }

    // Merge connection string into existing env vars
    const existingEnvVars = (service.envVars as Record<string, string>) || {};

    // We need to decrypt existing, merge, then re-encrypt
    const { encryptEnvVars, decryptEnvVars } = await import('../utils/encryption.js');

    let decryptedVars: Record<string, string> = {};
    if (Object.keys(existingEnvVars).length > 0) {
      try {
        decryptedVars = decryptEnvVars(existingEnvVars);
      } catch {
        decryptedVars = {};
      }
    }

    decryptedVars[envKey] = connectionString;

    const encryptedVars = encryptEnvVars(decryptedVars);

    await prisma.service.update({
      where: { id: service.id },
      data: { envVars: encryptedVars },
    });

    res.json({
      message: `Database linked. ${envKey} injected into service env vars.`,
      envKey,
    });
  } catch (error) {
    next(error);
  }
});
