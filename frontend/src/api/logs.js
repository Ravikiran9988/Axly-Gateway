import { apiClient } from './client';

export const logsApi = {
  listLogs: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.page) q.append('page', params.page);
    if (params.page_size) q.append('page_size', params.page_size);
    if (params.search) q.append('search', params.search);
    if (params.provider_id) q.append('provider_id', params.provider_id);
    if (params.gateway_key_id) q.append('gateway_key_id', params.gateway_key_id);
    if (params.status_code) q.append('status_code', params.status_code);
    if (params.status_filter) q.append('status_filter', params.status_filter);
    if (params.start_date) q.append('start_date', params.start_date);
    if (params.end_date) q.append('end_date', params.end_date);
    if (params.sort_by) q.append('sort_by', params.sort_by);
    if (params.sort_order) q.append('sort_order', params.sort_order);

    const res = await apiClient.get(`/api/admin/logs?${q.toString()}`);
    return res.data;
  },

  getLogDetail: async (requestId) => {
    const res = await apiClient.get(`/api/admin/logs/${requestId}`);
    return res.data;
  },

  exportCsv: async (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.provider_id) q.append('provider_id', params.provider_id);
    if (params.status_filter) q.append('status_filter', params.status_filter);
    if (params.start_date) q.append('start_date', params.start_date);
    if (params.end_date) q.append('end_date', params.end_date);

    const url = `/api/admin/logs/export/csv?${q.toString()}`;
    const token = apiClient.getToken();
    const res = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      throw new Error(`Export failed with HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `axly_request_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  },
};
