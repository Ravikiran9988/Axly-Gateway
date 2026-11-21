import { apiClient } from './client';

export const systemApi = {
  getHealth: async () => {
    return apiClient.get('/health');
  },

  getReady: async () => {
    return apiClient.get('/ready');
  },

  getDiagnostics: async () => {
    const res = await apiClient.get('/api/admin/health/diagnostics');
    return res.data;
  },

  getSettings: async () => {
    const res = await apiClient.get('/api/admin/settings');
    return res.data;
  },
};
