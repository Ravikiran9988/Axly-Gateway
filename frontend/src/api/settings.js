import { apiClient } from './client';

export const settingsApi = {
  listSettings: async () => {
    const res = await apiClient.get('/api/admin/settings');
    return res.data || [];
  },

  updateSetting: async (key, payload) => {
    const res = await apiClient.put(`/api/admin/settings/${key}`, payload);
    return res.data;
  },
};
