import { reactive } from 'vue';
import { api } from './api';
export const state = reactive({ user: null, obras: [], modules: [], loaded: false, alert: '', busy: false });
export async function refreshSession() {
  try {
    const u = await api.get('/session');
    state.user = u; state.obras = u.obras || []; state.modules = u.modules || [];
  } catch { state.user = null; state.obras = []; state.modules = []; }
  finally { state.loaded = true; }
  return !!state.user;
}
export function notice(message) { state.alert = message; window.setTimeout(() => state.alert = '', 4500); }
export function errorMessage(error) { return error?.message || 'No fue posible completar la operación'; }
