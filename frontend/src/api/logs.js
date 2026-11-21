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

  getExportCsvUrl: (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.append('search', params.search);
    if (params.provider_id) q.append('provider_id', params.provider_id);
    if (params.status_filter) q.append('status_filter', params.status_filter);
    if (params.start_date) q.append('start_date', params.start_date);
    if (params.end_date) q.append('end_date', params.end_date);
    return `/api/admin/logs/export/csv?${q.toString()}`;
  },
};
