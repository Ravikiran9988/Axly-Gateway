import { apiClient } from './client';

export const quotaGroupsApi = {
  listQuotaGroups: async () => {
    const res = await apiClient.get('/api/admin/quota-groups');
    return res.data || [];
  },

  getQuotaGroup: async (id) => {
    const res = await apiClient.get(`/api/admin/quota-groups/${id}`);
    return res.data;
  },

  createQuotaGroup: async (payload) => {
    const res = await apiClient.post('/api/admin/quota-groups', payload);
    return res.data;
  },

  updateQuotaGroup: async (id, payload) => {
    const res = await apiClient.patch(`/api/admin/quota-groups/${id}`, payload);
    return res.data;
  },

  deleteQuotaGroup: async (id) => {
    const res = await apiClient.delete(`/api/admin/quota-groups/${id}`);
    return res.data;
  },

  resetQuotaGroup: async (id) => {
    const res = await apiClient.post(`/api/admin/quota-groups/${id}/reset`);
    return res.data;
  },
};
