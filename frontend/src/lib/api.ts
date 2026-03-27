import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Auth
export const authApi = {
  register: (data: any) => api.post('/auth/register', data),
  login: (data: any) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data: any) => api.put('/auth/me', data),
};

// Foods
export const foodApi = {
  search: (params: { q?: string; category?: string; cuisine?: string; meal_type?: string; limit?: number }) =>
    api.get('/foods/', { params }),
  categories: () => api.get('/foods/categories'),
  cuisines: () => api.get('/foods/cuisines'),
  getById: (id: string) => api.get(`/foods/${id}`),
};

// Logs
export const logsApi = {
  create: (data: any) => api.post('/logs/', data),
  byDate: (date: string) => api.get(`/logs/date/${date}`),
  delete: (id: string) => api.delete(`/logs/${id}`),
  summary: (date: string) => api.get(`/logs/summary/${date}`),
  history: (start: string, end: string) =>
    api.get('/logs/history/range', { params: { start_date: start, end_date: end } }),
  macroHistory: (start: string, end: string) =>
    api.get('/logs/history/macros', { params: { start_date: start, end_date: end } }),
};
