import { apiClient } from './client';

export const credentialsApi = {
  listCredentials: async (providerId = null) => {
    const endpoint = providerId
      ? `/api/admin/credentials?provider_id=${providerId}`
      : '/api/admin/credentials';
    const res = await apiClient.get(endpoint);
    return res.data || [];
  },

  getCredential: async (id) => {
    const res = await apiClient.get(`/api/admin/credentials/${id}`);
    return res.data;
  },

  createCredential: async (payload) => {
    const res = await apiClient.post('/api/admin/credentials', payload);
    return res.data;
  },

  updateCredential: async (id, payload) => {
    const res = await apiClient.patch(`/api/admin/credentials/${id}`, payload);
    return res.data;
  },

  deleteCredential: async (id) => {
    const res = await apiClient.delete(`/api/admin/credentials/${id}`);
    return res.data;
  },

  testCredential: async (id) => {
    const res = await apiClient.post(`/api/admin/credentials/${id}/test`);
    return res.data;
  },

  getCredentialHealth: async (id) => {
    const res = await apiClient.get(`/api/admin/credentials/${id}/health`);
    return res.data;
  },

  applyCooldown: async (id, durationSeconds, reason) => {
    const res = await apiClient.post(`/api/admin/credentials/${id}/cooldown`, {
      duration_seconds: durationSeconds,
      reason,
    });
    return res.data;
  },

  recoverCredential: async (id, validateUpstream = true) => {
    const res = await apiClient.post(`/api/admin/credentials/${id}/recover`, {
      validate_upstream: validateUpstream,
    });
    return res.data;
  },
};
