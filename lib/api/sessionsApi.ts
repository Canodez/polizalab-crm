import { signOut } from 'aws-amplify/auth';
import { profileApi } from '../api-client';

export interface Session {
  sessionId: string;
  device: string;
  location?: string;
  lastActivity: string;
  isCurrent: boolean;
}

/**
 * Parse a User-Agent string into browser + OS labels (Spanish).
 * Detection order matters:
 *   Browser: Edg before Chrome (Edge UA contains "Chrome/")
 *            Chrome before Safari (Safari is in Chrome UA too)
 *   OS: iOS before Android; Windows/macOS/Linux as fallbacks
 */
export function parseUserAgent(ua: string): { browser: string; os: string } {
  let os = 'Desconocido';
  if (/iphone|ipad|ipod/i.test(ua))  os = 'iOS';
  else if (/android/i.test(ua))       os = 'Android';
  else if (/windows/i.test(ua))       os = 'Windows';
  else if (/mac os x/i.test(ua))      os = 'macOS';
  else if (/linux/i.test(ua))         os = 'Linux';

  let browser = 'Desconocido';
  if (/Edg\//i.test(ua))              browser = 'Edge';
  else if (/Firefox\//i.test(ua))     browser = 'Firefox';
  else if (/Chrome\//i.test(ua))      browser = 'Chrome';
  else if (/Safari\//i.test(ua))      browser = 'Safari';

  return { browser, os };
}

export const sessionsApi = {
  async listSessions(): Promise<Session[]> {
    const profile = await profileApi.getProfile();
    const ua =
      profile.deviceInfo ||
      (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    const { browser, os } = parseUserAgent(ua);
    return [{
      sessionId: 'current',
      device: `${browser} en ${os}`,
      lastActivity: profile.lastLoginAt || profile.createdAt,
      isCurrent: true,
    }];
  },

  async revokeSession(_id: string): Promise<void> {
    // No-op: single-session scope only
  },

  async revokeAllOtherSessions(): Promise<void> {
    await signOut({ global: true });
  },
};
