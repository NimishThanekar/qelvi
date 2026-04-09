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

// Guard: if multiple parallel requests all 401 at once, only redirect once.
let redirectingToLogin = false;

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !redirectingToLogin) {
      // Only force-logout when a token was actually sent with the request.
      // If there's no token, the 401 is expected and should be handled by the caller.
      const hadToken = !!localStorage.getItem('token');
      if (hadToken) {
        redirectingToLogin = true;
        // Clear raw token AND the Zustand persist blob so rehydration
        // doesn't re-write the invalid token back into localStorage.
        localStorage.removeItem('token');
        localStorage.removeItem('auth-storage');
        // Small delay so any in-flight state updates finish before the redirect.
        setTimeout(() => {
          redirectingToLogin = false;
          window.location.href = '/login';
        }, 50);
      }
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
  googleLogin: (credential: string) => api.post('/auth/google', { credential }),
  savePushSubscription: (subscription: any) =>
    api.put('/auth/push-subscription', { subscription }),
};

// Foods
export const foodApi = {
  search: (params: { q?: string; category?: string; cuisine?: string; meal_type?: string; limit?: number }) =>
    api.get('/foods/', { params }),
  categories: () => api.get('/foods/categories'),
  cuisines: () => api.get('/foods/cuisines'),
  getById: (id: string) => api.get(`/foods/${id}`),
  getRecommendations: (remaining_calories: number, meal_type?: string) =>
    api.get('/foods/recommendations', { params: { remaining_calories, ...(meal_type ? { meal_type } : {}) } }),
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
  frequent: () => api.get('/logs/frequent'),
  repeatLast: (mealType: string) => api.get('/logs/repeat-last', { params: { meal_type: mealType } }),
  saveTemplate: (data: any) => api.post('/logs/save-template', data),
  getTemplates: () => api.get('/logs/templates'),
  dayStatus: () => api.get('/logs/day-status'),
  contextStats: () => api.get('/logs/context-stats'),
  contextInsights: () => api.get('/logs/context-insights'),
  weeklyWrap: (weekStart?: string) =>
    api.get('/logs/weekly-wrap', { params: weekStart ? { week_start: weekStart } : {} }),
  getFoodPersonality: () => api.get('/logs/food-personality'),
};

// Buddy system
export const groupsApi = {
  create:  () => api.post('/groups/create', { name: 'buddy' }),
  join:    (code: string) => api.post(`/groups/join/${code}`),
  checkin: (groupId: string) => api.post(`/groups/checkin/${groupId}`, { mood: null }),
  my:      () => api.get('/groups/my'),
};

// AI meal estimation
export const aiApi = {
  estimate: (text: string, meal_type: string) =>
    api.post('/ai/estimate', { text, meal_type }),
};

// Subscription / Pro
export const subscriptionApi = {
  createOrder: (plan_type: string) =>
    api.post('/subscription/create-order', { plan_type }),
  verify: (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    plan_type: string;
  }) => api.post('/subscription/verify', data),
  getStatus: () => api.get('/subscription/status'),
};

// Festivals
export const festivalsApi = {
  active: (country?: string) =>
    api.get('/festivals/active', country ? { params: { country } } : {}),
  foods: (festivalId: string) =>
    api.get(`/festivals/${festivalId}/foods`),
  history: () => api.get('/festivals/history'),
};

// Admin / Notifications
export const adminApi = {
  pushStats: () => api.get('/notifications/stats'),
  broadcast: (data: { title: string; body: string; url: string; user_id?: string }) =>
    api.post('/notifications/broadcast', data),
  triggerReminders: (secret: string) =>
    api.post(`/notifications/send-reminders?secret=${encodeURIComponent(secret)}`),
};

// Custom Foods (user-exclusive)
export const customFoodsApi = {
  list: (q?: string) => api.get('/custom-foods/', { params: q ? { q } : {} }),
  create: (data: { name: string; calories_per_serving: number; serving_size_g?: number; combo_items?: any[] }) =>
    api.post('/custom-foods/', data),
  delete: (id: string) => api.delete(`/custom-foods/${id}`),
};

// Referral
export const referralApi = {
  stats: () => api.get('/referral/stats'),
};

// Practitioner Portal
export const practitionerApi = {
  overview: () => api.get('/practitioner/overview'),
  patients: () => api.get('/practitioner/patients'),
  patientSummary: (id: string) => api.get(`/practitioner/patients/${id}/summary`),
  patientLogs: (id: string, start: string, end: string) =>
    api.get(`/practitioner/patients/${id}/logs`, { params: { start, end } }),
  patientReport: (id: string, days?: number) =>
    api.get(`/practitioner/patients/${id}/report`, { params: days ? { days } : {} }),
  downloadReport: (id: string, days = 30) =>
    api.get(`/practitioner/patients/${id}/download-report`, {
      params: { days },
      responseType: 'blob',
    }),
};

