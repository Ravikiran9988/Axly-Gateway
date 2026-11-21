import { apiClient } from './client';

export const keysApi = {
  listKeys: async () => {
    const res = await apiClient.get('/api/v1/keys');
    return res.data || [];
  },

  createKey: async (payload) => {
    const res = await apiClient.post('/api/v1/keys', payload);
    return res.data;
  },

  revokeKey: async (keyId) => {
    const res = await apiClient.delete(`/api/v1/keys/${keyId}`);
    return res.data;
  },
};
