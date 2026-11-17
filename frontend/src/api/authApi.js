import { request } from './client';

export const authApi = {
  login(username, password) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  getSession() {
    return request('/auth/session');
  },

  me() {
    return request('/auth/me');
  },

  updateProfile(displayName) {
    return request('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ display_name: displayName }),
    });
  },

  changePassword(currentPassword, newPassword) {
    return request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  },

  logout() {
    return request('/auth/logout', { method: 'POST' });
  },
};
