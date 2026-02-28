import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// --- Projects ---
export const projectsApi = {
  list: (organizationId?: string) =>
    api.get('/api/projects', { params: { organizationId } }),
  get: (id: string) => api.get(`/api/projects/${id}`),
  create: (data: { name: string; organizationId?: string }) =>
    api.post('/api/projects', data),
  update: (id: string, data: { name: string }) =>
    api.put(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/projects/${id}`),
};

// --- Services ---
export const servicesApi = {
  list: (projectId?: string) =>
    api.get('/api/services', { params: { projectId } }),
  get: (id: string) => api.get(`/api/services/${id}`),
  create: (data: {
    name: string;
    projectId: string;
    repoUrl: string;
    branch?: string;
    runtime?: string;
    envVars?: Record<string, string>;
    healthCheckPath?: string;
    healthCheckInterval?: number;
    healthCheckTimeout?: number;
  }) => api.post('/api/services', data),
  update: (id: string, data: any) => api.put(`/api/services/${id}`, data),
  delete: (id: string) => api.delete(`/api/services/${id}`),
};

// --- Deployments ---
export const deploymentsApi = {
  list: (serviceId?: string) =>
    api.get('/api/deployments', { params: { serviceId } }),
  get: (id: string) => api.get(`/api/deployments/${id}`),
  trigger: (serviceId: string) => api.post('/api/deployments', { serviceId }),
  getLogs: (id: string) => api.get(`/api/deployments/${id}/logs`),
  cancel: (id: string) => api.post(`/api/deployments/${id}/cancel`),
  rollback: (id: string) => api.post(`/api/deployments/${id}/rollback`),
};

// --- Metrics ---
export const metricsApi = {
  getServiceMetrics: (serviceId: string) =>
    api.get(`/api/metrics/service/${serviceId}`),
  getOverview: () => api.get('/api/metrics/overview'),
};

// --- Domains ---
export const domainsApi = {
  list: (serviceId: string) => api.get(`/api/domains/service/${serviceId}`),
  add: (serviceId: string, hostname: string) =>
    api.post(`/api/domains/service/${serviceId}`, { hostname }),
  verify: (domainId: string) => api.post(`/api/domains/${domainId}/verify`),
  delete: (domainId: string) => api.delete(`/api/domains/${domainId}`),
};

// --- Organizations ---
export const organizationsApi = {
  list: () => api.get('/api/organizations'),
  get: (id: string) => api.get(`/api/organizations/${id}`),
  create: (data: { name: string; slug: string }) =>
    api.post('/api/organizations', data),
  update: (id: string, data: { name: string }) =>
    api.put(`/api/organizations/${id}`, data),
  delete: (id: string) => api.delete(`/api/organizations/${id}`),
  addMember: (orgId: string, data: { email: string; role?: string }) =>
    api.post(`/api/organizations/${orgId}/members`, data),
  updateMemberRole: (orgId: string, userId: string, role: string) =>
    api.put(`/api/organizations/${orgId}/members/${userId}`, { role }),
  removeMember: (orgId: string, userId: string) =>
    api.delete(`/api/organizations/${orgId}/members/${userId}`),
};

// --- Managed Databases ---
export const databasesApi = {
  list: (projectId?: string) =>
    api.get('/api/databases', { params: { projectId } }),
  get: (id: string) => api.get(`/api/databases/${id}`),
  create: (data: { name: string; projectId: string; type: string }) =>
    api.post('/api/databases', data),
  delete: (id: string) => api.delete(`/api/databases/${id}`),
  link: (dbId: string, serviceId: string) =>
    api.post(`/api/databases/${dbId}/link/${serviceId}`),
};
