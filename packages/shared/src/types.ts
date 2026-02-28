// Service status enum
export enum ServiceStatus {
  CREATED = 'CREATED',
  DEPLOYING = 'DEPLOYING',
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  FAILED = 'FAILED',
}

// Deployment status enum
export enum DeploymentStatus {
  QUEUED = 'QUEUED',
  BUILDING = 'BUILDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

// Member role enum
export enum MemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

// Database type enum
export enum DatabaseType {
  POSTGRES = 'POSTGRES',
  REDIS = 'REDIS',
  MYSQL = 'MYSQL',
}

// Database status enum
export enum DatabaseStatus {
  PROVISIONING = 'PROVISIONING',
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  FAILED = 'FAILED',
}

// User types
export interface User {
  id: string;
  email: string;
  username: string;
  githubId: string;
  avatarUrl?: string;
  githubAccessToken?: string;
  createdAt: Date;
}

// Organization types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
}

// Membership types
export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  role: MemberRole;
  createdAt: Date;
}

// Project types
export interface Project {
  id: string;
  name: string;
  userId: string;
  organizationId?: string;
  createdAt: Date;
}

// Service types
export interface Service {
  id: string;
  name: string;
  projectId: string;
  repoUrl: string;
  branch: string;
  runtime?: string;
  subdomain: string;
  status: ServiceStatus;
  containerId?: string;
  healthCheckPath?: string;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  webhookSecret?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Deployment types
export interface Deployment {
  id: string;
  serviceId: string;
  commitSha?: string;
  imageTag?: string;
  status: DeploymentStatus;
  logs?: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
}

// Domain types
export interface Domain {
  id: string;
  serviceId: string;
  hostname: string;
  verified: boolean;
  verificationToken: string;
  createdAt: Date;
}

// Managed database types
export interface ManagedDatabase {
  id: string;
  name: string;
  projectId: string;
  type: DatabaseType;
  status: DatabaseStatus;
  containerId?: string;
  host?: string;
  port?: number;
  dbName?: string;
  username?: string;
  password?: string;
  volumeName?: string;
  createdAt: Date;
}

// Health check config
export interface HealthCheckConfig {
  path: string;
  interval: number;
  timeout: number;
  retries: number;
}

// API Request/Response types
export interface CreateProjectRequest {
  name: string;
  organizationId?: string;
}

export interface CreateServiceRequest {
  name: string;
  projectId: string;
  repoUrl: string;
  branch?: string;
  runtime?: string;
  envVars?: Record<string, string>;
  healthCheckPath?: string;
  healthCheckInterval?: number;
  healthCheckTimeout?: number;
}

export interface TriggerDeploymentRequest {
  serviceId: string;
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
}

export interface InviteMemberRequest {
  email: string;
  role: MemberRole;
}

export interface CreateDomainRequest {
  hostname: string;
}

export interface CreateDatabaseRequest {
  name: string;
  projectId: string;
  type: DatabaseType;
}

// Job types for BullMQ
export interface DeploymentJobData {
  deploymentId: string;
  serviceId: string;
  repoUrl: string;
  branch: string;
  subdomain: string;
  envVars?: Record<string, string>;
  githubToken?: string;
  healthCheckPath?: string;
  healthCheckInterval?: number;
  healthCheckTimeout?: number;
}

export interface RollbackJobData {
  deploymentId: string;
  serviceId: string;
  subdomain: string;
  imageTag: string;
  envVars?: Record<string, string>;
  healthCheckPath?: string;
  healthCheckInterval?: number;
  healthCheckTimeout?: number;
}

export interface DeploymentJobResult {
  success: boolean;
  containerId?: string;
  imageTag?: string;
  error?: string;
  logs: string;
}

// Webhook types
export interface WebhookPayload {
  ref: string;
  after: string;
  repository: {
    full_name: string;
    clone_url: string;
  };
  sender: {
    login: string;
  };
}

// WebSocket event types
export interface LogStreamEvent {
  deploymentId: string;
  log: string;
  timestamp: Date;
}

export interface DeploymentStatusEvent {
  deploymentId: string;
  status: DeploymentStatus;
  containerId?: string;
}

export type RealtimeEvent =
  | {
      type: 'deployment:log';
      deploymentId: string;
      log: string;
      timestamp: string;
    }
  | {
      type: 'deployment:status';
      deploymentId: string;
      status: DeploymentStatus;
      timestamp: string;
      containerId?: string;
    }
  | {
      type: 'service:status';
      serviceId: string;
      status: ServiceStatus;
      timestamp: string;
    }
  | {
      type: 'service:metrics';
      serviceId: string;
      metrics: {
        cpuPercent: number;
        memoryUsage: number;
        memoryLimit: number;
        memoryPercent: number;
        networkRx: number;
        networkTx: number;
        timestamp: string;
      };
      timestamp: string;
    };

// Container metrics
export interface ContainerMetrics {
  containerId: string;
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  timestamp: Date;
}

// Auth types
export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
}

export interface GitHubProfile {
  id: string;
  username: string;
  email: string;
  avatarUrl: string;
}
