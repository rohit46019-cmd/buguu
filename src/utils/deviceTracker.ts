// Unique Device Identification and Sync Utility

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: 'Android' | 'iOS' | 'Windows' | 'macOS' | 'Linux' | 'Mobile' | 'Desktop';
  browser: string;
}

export function getOrCreateDeviceId(): string {
  try {
    let devId = localStorage.getItem('botflow_device_id');
    if (!devId || devId.trim() === '') {
      const randStr = Math.random().toString(36).substring(2, 10);
      const timeStr = Date.now().toString(36);
      devId = `dev_${timeStr}_${randStr}`;
      localStorage.setItem('botflow_device_id', devId);
    }
    return devId;
  } catch (e) {
    return `dev_${Date.now()}`;
  }
}

export function getDeviceInfo(): DeviceInfo {
  const deviceId = getOrCreateDeviceId();
  const ua = navigator.userAgent || '';
  
  let platform: DeviceInfo['platform'] = 'Desktop';
  let deviceName = 'Web Browser';
  let browser = 'Browser';

  if (/Android/i.test(ua)) {
    platform = 'Android';
    const modelMatch = ua.match(/Android[^;]+;\s*([^;)]+)\s*Build/i) || ua.match(/Android[^;]+;\s*([^;)]+)/i);
    const model = modelMatch && modelMatch[1] ? modelMatch[1].trim() : 'Android Device';
    deviceName = model;
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    platform = 'iOS';
    deviceName = /iPad/i.test(ua) ? 'Apple iPad' : 'Apple iPhone';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    platform = 'macOS';
    deviceName = 'Apple Mac';
  } else if (/Windows NT/i.test(ua)) {
    platform = 'Windows';
    deviceName = 'Windows PC';
  } else if (/Linux/i.test(ua)) {
    platform = 'Linux';
    deviceName = 'Linux System';
  }

  if (/Edg\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    browser = 'Google Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Mozilla Firefox';
  } else if (/OPR\//i.test(ua)) {
    browser = 'Opera';
  }

  const customName = `${deviceName} (${browser})`;

  return {
    deviceId,
    deviceName: customName,
    platform,
    browser
  };
}

let lastPingTime = 0;

export async function pingDeviceSession(accountId: string = 'default'): Promise<{ success: boolean; ip?: string }> {
  try {
    const now = Date.now();
    // Throttle pings to at most once per 15 seconds
    if (now - lastPingTime < 15000) {
      return { success: true };
    }
    lastPingTime = now;

    const info = getDeviceInfo();
    const res = await fetch('/api/devices/ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': info.deviceId,
        'x-device-name': info.deviceName,
        'x-account-id': accountId
      },
      body: JSON.stringify({
        deviceId: info.deviceId,
        deviceName: info.deviceName,
        platform: info.platform,
        accountId
      })
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, ip: data.ip };
    }
    return { success: false };
  } catch (e) {
    return { success: false };
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function enablePushNotifications(accountId: string = 'default'): Promise<{ success: boolean; message: string }> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { success: false, message: 'Push notifications are not supported in this browser.' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, message: 'Notification permission was denied.' };
    }

    const reg = await navigator.serviceWorker.ready;
    
    // Fetch VAPID public key
    const resKey = await fetch('/api/push/vapid-public-key');
    if (!resKey.ok) {
      return { success: false, message: 'Failed to retrieve VAPID public key from server.' };
    }
    const keyData = await resKey.json();
    const vapidPublicKey = keyData.publicKey;
    if (!vapidPublicKey) {
      return { success: false, message: 'VAPID public key not configured.' };
    }

    const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });

    const info = getDeviceInfo();
    const pushScope = localStorage.getItem('botflow_push_scope') || 'current';
    
    const resSub = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': info.deviceId,
        'x-device-name': info.deviceName,
        'x-account-id': accountId,
        'x-push-scope': pushScope
      },
      body: JSON.stringify({ ...subscription.toJSON(), pushScope })
    });

    if (resSub.ok) {
      return { success: true, message: 'Push notifications enabled successfully!' };
    } else {
      return { success: false, message: 'Failed to register subscription on server.' };
    }
  } catch (err: any) {
    console.error('Error enabling push:', err);
    return { success: false, message: err?.message || 'Error enabling push notifications.' };
  }
}

