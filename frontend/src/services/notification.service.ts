import { apiFetch } from './api';

export interface AppNotification {
  _id: string;
  user: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  read: boolean;
  created_at: string;
}

export const notificationService = {
  async registerToken(userId: string, token: string) {
    return apiFetch<{ success: boolean; message: string; tokenCount: number }>(
      '/api/notifications/register-token',
      {
        method: 'POST',
        body: JSON.stringify({ userId, token }),
      },
    );
  },

  async removeToken(userId: string, token: string) {
    return apiFetch<{ success: boolean; message: string }>(
      '/api/notifications/remove-token',
      {
        method: 'POST',
        body: JSON.stringify({ userId, token }),
      },
    );
  },

  async getUserNotifications(userId: string) {
    return apiFetch<{
      notifications: AppNotification[];
      unreadCount: number;
    }>('/api/notifications', {
      method: 'GET',
      params: { userId },
    });
  },

  async markAsRead(notificationId: string, userId: string) {
    return apiFetch<{ success: boolean; notification: AppNotification }>(
      `/api/notifications/${notificationId}/read`,
      {
        method: 'PATCH',
        body: JSON.stringify({ userId }),
      },
    );
  },

  async markAllAsRead(userId: string) {
    return apiFetch<{ success: boolean; message: string }>(
      '/api/notifications/read-all',
      {
        method: 'PATCH',
        body: JSON.stringify({ userId }),
      },
    );
  },

  async sendTestNotification(params: {
    userId?: string;
    token?: string;
    title?: string;
    body?: string;
  }) {
    return apiFetch<{ success: boolean; result?: any; notification?: any }>(
      '/api/notifications/test',
      {
        method: 'POST',
        body: JSON.stringify(params),
      },
    );
  },
};

