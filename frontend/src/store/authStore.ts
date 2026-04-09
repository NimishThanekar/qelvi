import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../lib/api';
import type { FestivalAdjustment } from '../types';

export type { FestivalAdjustment };

export interface User {
  id: string;
  email: string;
  name: string;
  age?: number;
  weight_kg?: number;
  height_cm?: number;
  gender?: string;
  activity_level?: string;
  dietary_preferences?: string[];
  calorie_goal?: number;
  bmr?: number;
  tdee?: number;
  is_admin?: boolean;
  is_pro?: boolean;
  ai_uses_remaining?: number;
  pro_expires_at?: string;
  plan_type?: string;
  country?: string;
  festival_mode?: string;
  festival_adjustment?: FestivalAdjustment | null;
  referral_code?: string;
  role?: string;
  is_practitioner?: boolean;
  practitioner_id?: string;
  practitioner_consent?: boolean;
  practitioner_name?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: any) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const res = await authApi.login({ email, password });
        const { access_token, user } = res.data;
        localStorage.setItem('token', access_token);
        set({ token: access_token, user, isAuthenticated: true });
      },

      register: async (data) => {
        const res = await authApi.register(data);
        const { access_token, user } = res.data;
        localStorage.setItem('token', access_token);
        set({ token: access_token, user, isAuthenticated: true });
      },

      googleLogin: async (credential) => {
        const res = await authApi.googleLogin(credential);
        const { access_token, user } = res.data;
        localStorage.setItem('token', access_token);
        set({ token: access_token, user, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null, isAuthenticated: false });
      },

      updateUser: async (data) => {
        const res = await authApi.updateProfile(data);
        set({ user: res.data });
      },

      refreshUser: async () => {
        try {
          const res = await authApi.me();
          set({ user: res.data });
        } catch (err: any) {
          // Only invalidate the session on a real 401 (token expired / invalid).
          // Network errors, 5xx, timeouts etc. must NOT log the user out — the
          // token is still valid, the backend is just temporarily unreachable
          // (very common on PWA cold-starts with slow mobile connections).
          if (err?.response?.status === 401) {
            get().logout();
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
      // Re-sync the raw 'token' key that the Axios interceptor reads directly.
      // This guards against cases where Android/PWA clears individual localStorage
      // keys while leaving the Zustand JSON blob intact (or vice-versa).
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          localStorage.setItem('token', state.token);
        }
      },
    }
  )
);
