import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
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

// API functions
export const projectsApi = {
  list: () => api.get('/api/projects'),
  get: (id: string) => api.get(`/api/projects/${id}`),
  create: (data: { name: string }) => api.post('/api/projects', data),
  update: (id: string, data: { name: string }) => api.put(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/projects/${id}`),
};

export const servicesApi = {
  list: (projectId?: string) => api.get('/api/services', { params: { projectId } }),
  get: (id: string) => api.get(`/api/services/${id}`),
  create: (data: {
    name: string;
    projectId: string;
    repoUrl: string;
    branch?: string;
    runtime?: string;
    envVars?: Record<string, string>;
  }) => api.post('/api/services', data),
  update: (id: string, data: any) => api.put(`/api/services/${id}`, data),
  delete: (id: string) => api.delete(`/api/services/${id}`),
};

export const deploymentsApi = {
  list: (serviceId?: string) => api.get('/api/deployments', { params: { serviceId } }),
  get: (id: string) => api.get(`/api/deployments/${id}`),
  trigger: (serviceId: string) => api.post('/api/deployments', { serviceId }),
  getLogs: (id: string) => api.get(`/api/deployments/${id}/logs`),
  cancel: (id: string) => api.post(`/api/deployments/${id}/cancel`),
};

export const metricsApi = {
  getServiceMetrics: (serviceId: string) => api.get(`/api/metrics/service/${serviceId}`),
  getOverview: () => api.get('/api/metrics/overview'),
};
