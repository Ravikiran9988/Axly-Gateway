import { apiClient } from './client';

export const analyticsApi = {
  getOverview: async (timeRange = '24h') => {
    const res = await apiClient.get(`/api/admin/analytics/overview?time_range=${timeRange}`);
    return res.data;
  },

  getTimeseries: async (timeRange = '24h', interval = 'hour') => {
    const res = await apiClient.get(
      `/api/admin/analytics/timeseries?time_range=${timeRange}&interval=${interval}`
    );
    return res.data || [];
  },

  getBreakdown: async (timeRange = '24h') => {
    const res = await apiClient.get(`/api/admin/analytics/breakdown?time_range=${timeRange}`);
    return res.data || {};
  },
};
