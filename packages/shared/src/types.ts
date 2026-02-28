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

// User types
export interface User {
  id: string;
  email: string;
  username: string;
  githubId: string;
  avatarUrl?: string;
  createdAt: Date;
}

// Project types
export interface Project {
  id: string;
  name: string;
  userId: string;
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
  createdAt: Date;
  updatedAt: Date;
}

// Deployment types
export interface Deployment {
  id: string;
  serviceId: string;
  commitSha?: string;
  status: DeploymentStatus;
  logs?: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
}

// API Request/Response types
export interface CreateProjectRequest {
  name: string;
}

export interface CreateServiceRequest {
  name: string;
  projectId: string;
  repoUrl: string;
  branch?: string;
  runtime?: string;
  envVars?: Record<string, string>;
}

export interface TriggerDeploymentRequest {
  serviceId: string;
}

// Job types for BullMQ
export interface DeploymentJobData {
  deploymentId: string;
  serviceId: string;
  repoUrl: string;
  branch: string;
  subdomain: string;
  envVars?: Record<string, string>;
}

export interface DeploymentJobResult {
  success: boolean;
  containerId?: string;
  error?: string;
  logs: string;
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
