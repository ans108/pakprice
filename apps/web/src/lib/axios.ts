import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// Response interceptor — normalise errors for backward & forward contract compatibility
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Server responded with a non-2xx status
      const data = error.response.data || {};
      const statusCode = data.statusCode || error.response.status;
      const requestId = data.requestId || error.response.headers?.['x-request-id'] || 'unknown';

      const errorDetail = typeof data.error === 'object' && data.error !== null
        ? data.error
        : { code: 'API_ERROR', message: data.message || data.error || 'An error occurred' };

      const message = errorDetail.message || data.message || 'An unexpected error occurred.';

      const normalized = {
        success: false,
        error: errorDetail,
        message,
        statusCode,
        requestId,
        code: errorDetail.code,
      };

      return Promise.reject(normalized);
    }
    if (error.request) {
      // No response received
      return Promise.reject({
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Cannot reach the PakPrice API. Is it running?' },
        message: 'Cannot reach the PakPrice API. Is it running?',
        statusCode: 0,
        requestId: 'client-network-error',
        code: 'NETWORK_ERROR',
      });
    }
    return Promise.reject(error);
  }
);

export default apiClient;
