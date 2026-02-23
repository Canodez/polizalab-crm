export interface Session {
  sessionId: string;
  device: string;
  location?: string;
  lastActivity: string;
  isCurrent: boolean;
}

export const sessionsApi = {
  async listSessions(): Promise<Session[]> {
    return [];
  },
  async revokeSession(_id: string): Promise<void> {},
  async revokeAllOtherSessions(): Promise<void> {},
};
