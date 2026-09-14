import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
const EAS_PROJECT_ID = 'ee6d3d46-e340-43d4-9eef-4b6ad4427452';
const DAILY_REMINDER_KEY = '@safe_sentinel_daily_reminder_v1';
const TOKEN_STORAGE_KEY = 'user_secure_token';

if (!(Platform.OS === 'android' && __DEV__)) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
}

const ensurePermission = async () => {
  let permission = await Notifications.getPermissionsAsync();
  if (permission?.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync();
  }
  return permission?.status === 'granted';
};

const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('security-alerts', {
    name: 'Safe Sentinel Security Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 150, 250],
    sound: 'default',
    enableVibrate: true,
    showBadge: true
  });
};

const ensureDailyReminder = async () => {
  const alreadyScheduled = await AsyncStorage.getItem(DAILY_REMINDER_KEY);
  if (alreadyScheduled) return;

  const dailyType = Notifications.SchedulableTriggerInputTypes?.DAILY;
  const trigger = dailyType
    ? { type: dailyType, hour: 18, minute: 30 }
    : { hour: 18, minute: 30, repeats: true };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Safe Sentinel Pro',
      body: 'Bugünkü cüzdan güvenliğini kontrol ettin mi? İşlem yapmadan önce riski gör.',
      sound: 'default',
      data: { type: 'DAILY_SECURITY_REMINDER' }
    },
    trigger
  });

  await AsyncStorage.setItem(DAILY_REMINDER_KEY, '1');
};

const registerPushDevice = async () => {
  if (!BACKEND_URL || Platform.OS === 'web') return false;

  const authToken = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
  if (!authToken) return false;

  const pushToken = await Notifications.getExpoPushTokenAsync({
    projectId: EAS_PROJECT_ID
  });

  if (!pushToken?.data) return false;

  const response = await fetch(`${BACKEND_URL}/api/push-devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      token: pushToken.data,
      platform: Platform.OS
    })
  });

  if (!response.ok) {
    throw new Error(`Push device registration failed: ${response.status}`);
  }

  return true;
};

function SafeSentinelRoot() {
  useEffect(() => {
    if (Platform.OS === 'web' || (Platform.OS === 'android' && __DEV__)) return undefined;

    let stopped = false;
    let timer = null;

    const setup = async () => {
      try {
        const granted = await ensurePermission();
        if (!granted || stopped) return;

        await ensureAndroidChannel();
        await ensureDailyReminder();

        const registered = await registerPushDevice();
        if (!registered && !stopped) {
          timer = setTimeout(setup, 15000);
        }
      } catch (error) {
        console.warn('[SAFE SENTINEL PUSH]', error?.message || error);
        if (!stopped) timer = setTimeout(setup, 30000);
      }
    };

    setup();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <App />;
}

registerRootComponent(SafeSentinelRoot);
