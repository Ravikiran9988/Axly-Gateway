const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('axly_token') || null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('axly_token', token);
    } else {
      localStorage.removeItem('axly_token');
    }
  }

  getToken() {
    return this.token;
  }

  async request(endpoint, options = {}) {
    let url = endpoint;
    if (!endpoint.startsWith('http')) {
      const base = API_BASE_URL || (typeof window !== 'undefined' && window.location?.origin) || 'http://localhost:5173';
      url = `${base}${endpoint}`;
    }
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const error = new Error(
          (data && data.error && data.error.message) ||
          (data && data.message) ||
          `Request failed with status ${response.status}`
        );
        error.status = response.status;
        error.code = data && data.error && data.error.code;
        error.details = data && data.error && data.error.details;
        throw error;
      }

      return data;
    } catch (err) {
      throw err;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
