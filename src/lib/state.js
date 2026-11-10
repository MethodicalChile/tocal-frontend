import { reactive } from 'vue';
import { api } from './api';
import { authorizationApi } from '../modules/administration/services/authorizationApi';

const STORAGE_KEY = 'tocal.activeCompany';
const empty = () => ({ user: null, obras: [], modules: [], loaded: false, alert: '', busy: false,
  companies: [], activeCompanyId: '', companyLoading: false,
  permissions: [], globalPermissions: [], obraPermissions: {},
  permissionsCompanyId: '', permissionsLoading: false, rbac: true });
export const state = reactive(empty());
let sessionObras = [];
let companySequence = 0;
let permissionSequence = 0;
let permissionPromise = null;

export function can(permission, obraId = null) {
  if (!state.activeCompanyId || state.permissionsCompanyId !== state.activeCompanyId) {
    return false;
  }
  if (obraId) {
    const key = String(obraId);
    const hasScopedMap = state.globalPermissions.length > 0 || Object.keys(state.obraPermissions || {}).length > 0;
    if (hasScopedMap) {
      if (state.globalPermissions.includes(permission)) return true;
      const scoped = state.obraPermissions?.[key];
      return Array.isArray(scoped) && scoped.includes(permission);
    }
  }
  return state.permissions.includes(permission);
}

export function canGlobal(permission) {
  if (!state.activeCompanyId || state.permissionsCompanyId !== state.activeCompanyId) {
    return false;
  }
  if (state.globalPermissions.length > 0 || Object.keys(state.obraPermissions || {}).length > 0) {
    return state.globalPermissions.includes(permission);
  }
  return state.permissions.includes(permission);
}

export function canAccessSales() {
  // El backend restringe ventas globales a usuarios legacy de gerencia.
  return Boolean(state.user?.role === 'gerencia' && state.rbac === false);
}

export async function loadPermissions() {
  const companyId = state.activeCompanyId;
  const sequence = ++permissionSequence;
  state.permissions = [];
  state.globalPermissions = [];
  state.obraPermissions = {};
  state.permissionsCompanyId = '';
  state.permissionsLoading = Boolean(state.user && companyId);
  if (!state.user || !companyId) return;
  const pending = authorizationApi.myPermissions(companyId);
  permissionPromise = pending;
  try {
    const result = await pending;
    if (sequence !== permissionSequence || state.activeCompanyId !== companyId) return;
    state.permissions = Array.isArray(result.permissions) ? result.permissions : [];
    state.globalPermissions = Array.isArray(result.global_permissions) ? result.global_permissions : state.permissions;
    state.obraPermissions = result.obra_permissions && typeof result.obra_permissions === 'object' ? result.obra_permissions : {};
    state.permissionsCompanyId = companyId;
  } finally {
    if (sequence === permissionSequence) state.permissionsLoading = false;
    if (permissionPromise === pending) permissionPromise = null;
  }
}

export async function ensurePermissions() {
  if (!state.user || !state.activeCompanyId) return false;
  if (state.permissionsCompanyId === state.activeCompanyId) return true;
  if (permissionPromise) {
    try { await permissionPromise; } catch { /* Se deniega el acceso por defecto. */ }
    if (state.permissionsCompanyId === state.activeCompanyId) return true;
  }
  try { await loadPermissions(); } catch { return false; }
  return state.permissionsCompanyId === state.activeCompanyId;
}


export function clearCompanyContext() {
  companySequence++;
  permissionSequence++;
  state.permissions = [];
  state.globalPermissions = [];
  state.obraPermissions = {};
  state.permissionsCompanyId = '';
  state.permissionsLoading = false;
  state.companies = [];
  state.activeCompanyId = '';
  state.obras = [];
  sessionObras = [];
  localStorage.removeItem(STORAGE_KEY);
}
export async function loadCompanies() {
  const sequence = ++companySequence;
  state.companyLoading = true;
  try {
    if (!state.user) { clearCompanyContext(); return; }
    const data = await api.get('/authorization/mis-empresas/');
    if (sequence !== companySequence) return;
    state.companies = Array.isArray(data.results) ? data.results : [];
    const previous = state.activeCompanyId || localStorage.getItem(STORAGE_KEY);
    const selected = state.companies.some(x => x.id === previous)
      ? previous : (state.companies[0]?.id || '');
    selectCompany(selected);
  } catch (error) {
    if (sequence === companySequence) { state.companies = []; selectCompany(''); throw error; }
  } finally { if (sequence === companySequence) state.companyLoading = false; }
}
export function selectCompany(id) {
  const company = state.companies.find(c => c.id === id);
  const nextId = company?.id || '';
  const changed = state.activeCompanyId !== nextId;
  state.activeCompanyId = nextId;
  if (changed) {
    permissionSequence++;
    state.permissions = [];
    state.permissionsCompanyId = '';
    // Los permisos se recargan desde el backend al cambiar de empresa.
    loadPermissions().catch(() => {});
  }
  const ids = new Set((company?.obra_ids || []).map(String));
  state.obras = sessionObras.filter(o => ids.has(String(o.id)));
  if (company) localStorage.setItem(STORAGE_KEY, company.id);
  else localStorage.removeItem(STORAGE_KEY);
}
export async function refreshSession() {
  try {
    const u = await api.get('/session');
    state.user = u;
    state.rbac = u.rbac !== false;
    sessionObras = u.obras || [];
    state.modules = u.modules || [];
    await loadCompanies();
  } catch {
    state.user = null; state.modules = []; state.rbac = true; clearCompanyContext();
  } finally { state.loaded = true; }
  return !!state.user;
}
export function notice(message) { state.alert = message; window.setTimeout(() => state.alert = '', 4500); }
export function errorMessage(error) { return error?.message || 'No fue posible completar la operación'; }
