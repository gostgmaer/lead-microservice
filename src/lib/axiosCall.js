import axios from 'axios';

const instance = axios.create({
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

instance.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
);

/**
 * Universal API call handler.
 * @returns {{ data, status, headers } | { error, status, message, data }}
 */
async function apiCall(url, options = {}, overrideConfig = {}) {
  try {
    const config = { url, ...options, ...overrideConfig };
    const response = await instance.request(config);
    return { data: response.data, status: response.status, headers: response.headers };
  } catch (error) {
    if (error.response) {
      return {
        error: true,
        status: error.response.status,
        data: error.response.data,
        message: error.response.statusText || 'API error',
        headers: error.response.headers,
      };
    }
    if (error.request) {
      return { error: true, status: null, data: null, message: 'No response from API (network issue or timeout)' };
    }
    return { error: true, status: null, data: null, message: error.message || 'Unknown error' };
  }
}

export { apiCall, instance };
