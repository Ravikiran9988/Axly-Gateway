import { apiClient } from './client';

export const modelsApi = {
  listModels: async (providerId = null) => {
    const endpoint = providerId
      ? `/api/admin/models?provider_id=${providerId}`
      : '/api/admin/models';
    const res = await apiClient.get(endpoint);
    return res.data || [];
  },

  getModel: async (id) => {
    const res = await apiClient.get(`/api/admin/models/${id}`);
    return res.data;
  },

  createModel: async (payload) => {
    const res = await apiClient.post('/api/admin/models', payload);
    return res.data;
  },

  updateModel: async (id, payload) => {
    const res = await apiClient.patch(`/api/admin/models/${id}`, payload);
    return res.data;
  },

  deleteModel: async (id) => {
    const res = await apiClient.delete(`/api/admin/models/${id}`);
    return res.data;
  },

  listV1Models: async () => {
    const res = await apiClient.get('/v1/models');
    return res.data || [];
  },
};
