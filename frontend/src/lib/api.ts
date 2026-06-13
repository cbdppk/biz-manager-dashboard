import axios from 'axios';
import { clearAuthToken, getStoredToken, isTokenExpired, setAuthToken } from '@/lib/auth';

/** Strip whitespace/newlines from Vercel env; fall back to monorepo API path on Vercel builds. */
export function resolveApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\s/g, '').replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.VERCEL) return '/_/backend/api';
  return 'http://localhost:4000/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

// Proactively refresh the token if it expires within the next 24 hours.
// This runs before the request, while the token is still valid, so the
// /refresh endpoint can accept it without ignoreExpiration edge cases.
api.interceptors.request.use(async (config) => {
  const token = getStoredToken();
  if (!token) return config;

  const REFRESH_LEAD_SECONDS = 86400; // 24 h
  if (isTokenExpired(token, REFRESH_LEAD_SECONDS) && !config.url?.includes('/auth/')) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const res = await axios.post(
          `${config.baseURL ?? api.defaults.baseURL}/auth/refresh`,
          null,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAuthToken(res.data.token);
      } catch {
        // If proactive refresh fails, let the request proceed — the response
        // interceptor will catch the 401 and redirect to login if needed.
      } finally {
        isRefreshing = false;
      }
    }
  }

  const current = getStoredToken();
  if (current) config.headers.Authorization = `Bearer ${current}`;
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

function flushRefreshQueue(token: string | null) {
  refreshQueue.forEach((cb) => cb(token));
  refreshQueue = [];
}

function redirectToLogin() {
  clearAuthToken();
  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname + window.location.search;
    if (!currentPath.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
    } else {
      window.location.href = '/login';
    }
  }
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    // Only attempt refresh for 401s that aren't the refresh/login endpoints themselves.
    if (
      err.response?.status === 401 &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true;

      if (isRefreshing) {
        // Queue this request until the refresh completes.
        return new Promise((resolve, reject) => {
          refreshQueue.push((newToken) => {
            if (!newToken) return reject(err);
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const token = getStoredToken();
        if (!token) throw new Error('No token to refresh');
        const res = await axios.post(
          `${original.baseURL ?? api.defaults.baseURL}/auth/refresh`,
          null,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const newToken: string = res.data.token;
        setAuthToken(newToken);
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        flushRefreshQueue(newToken);
        return api(original);
      } catch {
        flushRefreshQueue(null);
        redirectToLogin();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    if (err.response?.status === 401) {
      redirectToLogin();
    }

    return Promise.reject(err);
  }
);

export default api;

// Typed API calls
export const salesAPI = {
  create: (data: any) => api.post('/sales', data),
  list: (params?: any) => api.get('/sales', { params }),
  get: (id: string) => api.get(`/sales/${id}`),
  summary: (period: string) => api.get('/sales/summary', { params: { period } })
};

export const productsAPI = {
  list: (params?: any) => api.get('/products', { params }),
  get: (id: string) => api.get(`/products/${id}`),
  create: (data: any) => api.post('/products', data),
  update: (id: string, data: any) => api.patch(`/products/${id}`, data),
  delete: (id: string) => api.delete(`/products/${id}`),
  restock: (id: string, data: { quantity: number; note?: string }) => api.post(`/products/${id}/restock`, data),
  stockMovements: (id: string) => api.get(`/products/${id}/stock-movements`),
};

export const customersAPI = {
  list: (params?: any) => api.get('/customers', { params }),
  get: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data),
  getCredit: (id: string) => api.get(`/customers/${id}/credit`),
  sendReminder: (id: string) => api.post(`/customers/${id}/remind`)
};

export const paymentsAPI = {
  record: (data: any) => api.post('/payments', data),
};

export const momoAPI = {
  collect: (data: { phone: string; amount: number; sale_id?: string | null; note?: string }) =>
    api.post('/payments/momo/collect', data),
  status: (reference: string) => api.get(`/payments/momo/status/${reference}`),
};

export const invoicesAPI = {
  list: (params?: any) => api.get('/invoices', { params }),
  get: (id: string) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  update: (id: string, data: any) => api.patch(`/invoices/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/invoices/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/invoices/${id}`),
  send: (id: string) => api.post(`/invoices/${id}/send`),
  getPdfUrl: (id: string) => `${api.defaults.baseURL}/invoices/${id}/pdf`,
};

export const aiAPI = {
  ask: (message: string, history?: any[]) =>
    api.post('/ai/ask', { message, conversation_history: history }, { timeout: 60000 }),
  insights: (params?: { context?: string; period?: string }) =>
    api.get('/ai/insights', { params, timeout: 35000 }),
  executeTool: (tool_name: string, tool_input: Record<string, unknown>) =>
    api.post('/ai/execute-tool', { tool_name, tool_input }, { timeout: 45000 }),
};

export const menuAPI = {
  categories: () => api.get('/menu/categories'),
  createCategory: (data: { name: string; sort_order?: number; is_active?: boolean }) => api.post('/menu/categories', data),
  options: (productId: string) => api.get(`/menu/items/${productId}/options`),
  createOption: (data: any) => api.post('/menu/items/options', data),
};

export const ordersAPI = {
  create: (data: any) => api.post('/orders', data),
  list: (params?: any) => api.get('/orders', { params }),
  dailyClose: (data: any) => api.post('/orders/daily-close', data),
  kitchenQueue: () => api.get('/orders/kitchen/queue'),
  updateStatus: (id: string, status: string) => api.patch(`/orders/${id}/status`, { status }),
  updateKitchenStatus: (id: string, itemId: string, kitchen_status: string) =>
    api.patch(`/orders/${id}/items/${itemId}/kitchen-status`, { kitchen_status }),
  complete: (id: string, data: { payment_method: 'cash' | 'momo' | 'card' | 'credit'; amount_paid: number; customer_id?: string | null }) =>
    api.post(`/orders/${id}/complete`, data),
};

export const recipesAPI = {
  list: () => api.get('/recipes'),
  upsert: (data: any) => api.post('/recipes', data),
};

export const reportsAPI = {
  food: (params?: { from?: string; to?: string }) => api.get('/reports/food', { params }),
  businessSummary: (params?: { period?: string; from?: string; to?: string }) =>
    api.get('/reports/business-summary', { params }),
  loanReadiness: (params?: { period?: string; from?: string; to?: string }) =>
    api.get('/reports/loan-readiness', { params }),
  businessReportPdfUrl: (params?: { period?: string; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.period) query.set('period', params.period);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    const qs = query.toString();
    return `${api.defaults.baseURL}/reports/business-report/pdf${qs ? `?${qs}` : ''}`;
  },
};

export const expensesAPI = {
  list: (params?: { from?: string; to?: string; category?: string }) => api.get('/expenses', { params }),
  summary: (params?: { from?: string; to?: string }) => api.get('/expenses/summary', { params }),
  get: (id: string) => api.get(`/expenses/${id}`),
  create: (data: {
    title: string;
    category?: string;
    amount: number;
    payment_method?: string;
    expense_date: string;
    note?: string | null;
  }) => api.post('/expenses', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/expenses/${id}`, data),
  delete: (id: string) => api.delete(`/expenses/${id}`),
};

export const supportAPI = {
  submitFeedback: (data: { type: string; area: string; message: string; contact?: string }) =>
    api.post('/support/feedback', data),
  listFeedback: (params?: { status?: string; limit?: number }) =>
    api.get('/support/feedback', { params }),
  updateFeedback: (id: string, data: { status: 'open' | 'reviewed' }) =>
    api.patch(`/support/feedback/${id}`, data),
};

export const auditAPI = {
  list: (params?: { category?: string; action?: string; entity_type?: string; limit?: number }) =>
    api.get('/audit-logs', { params }),
};
