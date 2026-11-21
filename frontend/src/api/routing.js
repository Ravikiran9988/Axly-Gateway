import { apiClient } from './client';

export const routingApi = {
  // Profiles
  listProfiles: async () => {
    const res = await apiClient.get('/api/admin/routing/profiles');
    return res.data || [];
  },

  getProfile: async (id) => {
    const res = await apiClient.get(`/api/admin/routing/profiles/${id}`);
    return res.data;
  },

  createProfile: async (payload) => {
    const res = await apiClient.post('/api/admin/routing/profiles', payload);
    return res.data;
  },

  updateProfile: async (id, payload) => {
    const res = await apiClient.patch(`/api/admin/routing/profiles/${id}`, payload);
    return res.data;
  },

  deleteProfile: async (id) => {
    const res = await apiClient.delete(`/api/admin/routing/profiles/${id}`);
    return res.data;
  },

  // Aliases
  listAliases: async () => {
    const res = await apiClient.get('/api/admin/routing/aliases');
    return res.data || [];
  },

  getAlias: async (id) => {
    const res = await apiClient.get(`/api/admin/routing/aliases/${id}`);
    return res.data;
  },

  createAlias: async (payload) => {
    const res = await apiClient.post('/api/admin/routing/aliases', payload);
    return res.data;
  },

  updateAlias: async (id, payload) => {
    const res = await apiClient.patch(`/api/admin/routing/aliases/${id}`, payload);
    return res.data;
  },

  deleteAlias: async (id) => {
    const res = await apiClient.delete(`/api/admin/routing/aliases/${id}`);
    return res.data;
  },

  setAliasCandidates: async (aliasId, candidates) => {
    const res = await apiClient.put(`/api/admin/routing/aliases/${aliasId}/candidates`, {
      candidates,
    });
    return res.data || [];
  },

  // Health Overview
  getRoutingHealth: async () => {
    const res = await apiClient.get('/api/admin/routing/health');
    return res.data || {};
  },

  // History Traces
  getRoutingHistory: async (requestId = null, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit, offset });
    if (requestId) params.append('request_id', requestId);
    const res = await apiClient.get(`/api/admin/routing/history?${params.toString()}`);
    return res.data || [];
  },
};
