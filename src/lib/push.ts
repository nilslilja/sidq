import { env, isBackendConfigured, isPushConfigured } from './env';
import { getAccessToken } from './supabase';

/*
 * Web push. The morning notification is what turns Sidq from an app you remember
 * to open into a ritual, so this is treated as core rather than as a setting.
 *
 * The permission prompt is never fired on load. It is asked for after the user has
 * closed at least one day, because a prompt before value is a permanent no.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported';
}

export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'This browser cannot do web push.' };
  if (!isPushConfigured || !isBackendConfigured) {
    return { ok: false, reason: 'Push is not configured in this environment.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notifications are blocked. You can turn them on in browser settings.' };
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(env.vapidPublicKey) as BufferSource,
    }));

  const token = await getAccessToken();
  if (!token) return { ok: false, reason: 'Sign in first so reminders reach you on every device.' };

  const res = await fetch(`${env.supabaseUrl}/functions/v1/register-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) return { ok: false, reason: 'Could not save the reminder on the server.' };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  await subscription?.unsubscribe();
}
