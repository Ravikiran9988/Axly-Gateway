import { apiClient } from './client';

export const authApi = {
  getSetupStatus: async () => {
    const res = await apiClient.get('/api/admin/setup/status');
    return res.data;
  },

  completeSetup: async (email, password) => {
    const res = await apiClient.post('/api/admin/setup', { email, password });
    return res;
  },

  login: async (email, password) => {
    const res = await apiClient.post('/api/admin/auth/login', { email, password });
    if (res.data && res.data.access_token) {
      apiClient.setToken(res.data.access_token);
    }
    return res.data;
  },

  getMe: async () => {
    const res = await apiClient.get('/api/admin/auth/me');
    return res.data;
  },

  logout: async () => {
    try {
      await apiClient.post('/api/admin/auth/logout');
    } finally {
      apiClient.setToken(null);
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    const res = await apiClient.post('/api/admin/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return res;
  },
};
