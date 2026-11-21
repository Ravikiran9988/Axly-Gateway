import { apiClient } from './client';

export const providersApi = {
  listProviders: async () => {
    const res = await apiClient.get('/api/admin/providers');
    return res.data || [];
  },

  getProvider: async (id) => {
    const res = await apiClient.get(`/api/admin/providers/${id}`);
    return res.data;
  },

  createProvider: async (payload) => {
    const res = await apiClient.post('/api/admin/providers', payload);
    return res.data;
  },

  updateProvider: async (id, payload) => {
    const res = await apiClient.patch(`/api/admin/providers/${id}`, payload);
    return res.data;
  },

  deleteProvider: async (id) => {
    const res = await apiClient.delete(`/api/admin/providers/${id}`);
    return res.data;
  },

  getProviderCredentials: async (providerId) => {
    const res = await apiClient.get(`/api/admin/providers/${providerId}/credentials`);
    return res.data || [];
  },

  discoverModels: async (providerId) => {
    const res = await apiClient.post(`/api/admin/providers/${providerId}/discover-models`);
    return res.data || [];
  },
};
