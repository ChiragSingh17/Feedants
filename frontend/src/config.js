import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Resolve API base. For Expo Go on physical device, use your LAN IP.
// Override via app.config.js extra.apiUrl or EXPO_PUBLIC_API_URL
const LAN_IP = '192.168.1.5'; // <-- change to your machine IP if testing on device; localhost works for web/simulator

function getDefaultHost() {
  if (Platform.OS === 'android' && !__DEV__) return `http://${LAN_IP}:4000`;
  // Android emulator maps host localhost to 10.0.2.2
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000';
  return 'http://localhost:4000';
}

export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  getDefaultHost();

export const COMPETITION_SLUG = 'feedants-classical-dance';
export const DEMO_USER_ID = 'demo-user-001'; // header x-user-id
