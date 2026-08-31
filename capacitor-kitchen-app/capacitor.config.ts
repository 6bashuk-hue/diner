import type { CapacitorConfig } from '@capacitor/cli';

// appId / appName are configurable via env vars so this same template can be
// reused for other clients/sites without editing code — see README.md.
const config: CapacitorConfig = {
  appId: process.env.APP_ID || 'com.hadiner.kitchen',
  appName: process.env.APP_NAME || 'הדיינר מטבח',
  webDir: 'www',
};

export default config;
