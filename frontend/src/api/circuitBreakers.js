import { apiClient } from './client';

export const circuitBreakersApi = {
  listCircuitBreakers: async () => {
    const res = await apiClient.get('/api/admin/circuit-breakers');
    return res.data || [];
  },

  resetCircuitBreaker: async (id) => {
    const res = await apiClient.post(`/api/admin/circuit-breakers/${id}/reset`);
    return res.data;
  },
};
