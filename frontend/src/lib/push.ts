/**
 * lib/push.ts — Web Push subscription helpers
 *
 * Flow:
 *   1. requestPermission()       — asks the browser for notification permission
 *   2. subscribePush()           — registers a Push subscription with the SW
 *   3. savePushSubscription(sub) — sends the subscription to the backend
 *   4. unsubscribePush()         — unregisters and clears the backend record
 */

import { authApi } from './api';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export async function subscribePush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VITE_VAPID_PUBLIC_KEY not set');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;

    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  } catch (err) {
    console.error('Push subscribe failed:', err);
    return null;
  }
}

export async function savePushSubscription(sub: PushSubscription): Promise<void> {
  try {
    await authApi.savePushSubscription(sub.toJSON());
  } catch (err) {
    console.error('Failed to save push subscription:', err);
  }
}

export async function unsubscribePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await authApi.savePushSubscription(null);
    }
  } catch (err) {
    console.error('Unsubscribe failed:', err);
  }
}

/**
 * One-shot: request permission → subscribe → save to backend.
 * Safe to call multiple times — silently skips if already subscribed.
 */
export async function setupPushNotifications(): Promise<boolean> {
  const perm = await requestPermission();
  if (perm !== 'granted') return false;
  const sub = await subscribePush();
  if (!sub) return false;
  await savePushSubscription(sub);
  return true;
}
