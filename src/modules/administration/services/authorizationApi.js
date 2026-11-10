import { api } from '../../../lib/api';

function scoped(empresaId, suffix = '') {
  if (!/^[0-9a-f-]{36}$/i.test(String(empresaId || ''))) throw new Error('Configura VITE_TOCAL_EMPRESA_ID con el UUID de la empresa');
  return `/authorization/empresas/${encodeURIComponent(empresaId)}/${suffix}`;
}

export const authorizationApi = {
  myCompanies: () => api.get('/authorization/mis-empresas/'),
  getCompany: (id) => api.get(scoped(id, '')),
  updateCompany: (id, data) => api.patch(scoped(id, ''), data),
  myPermissions: (id) => api.get(scoped(id, 'mis-permisos/')),
  roles: (id) => api.get(scoped(id, 'roles/')),
  permissions: (id) => api.get(scoped(id, 'permisos/')),
  members: (id) => api.get(scoped(id, 'miembros/')),
  updateMember: (id, memberId, data) => api.patch(scoped(id, `miembros/${encodeURIComponent(memberId)}/`), data),
  assignments: (id) => api.get(scoped(id, 'asignaciones/')),
  auditLogs: (id, params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const suffix = qs.toString() ? `auditoria/?${qs.toString()}` : 'auditoria/';
    return api.get(scoped(id, suffix));
  },
  createRole: (id, data) => api.post(scoped(id, 'roles/crear/'), data),
  replaceRolePermissions: (id, roleId, permissions) => api.put(scoped(id, `roles/${encodeURIComponent(roleId)}/permisos/`), { permisos: permissions }),
  createUser: (id, data) => api.post(scoped(id, 'miembros/nuevo-usuario/'), data),
  addMember: (id, userId) => api.post(scoped(id, 'miembros/crear/'), { usuario_id: userId }),
  assignRole: (id, data) => api.post(scoped(id, 'asignaciones/crear/'), data),
  revokeAssignment: (id, assignmentId) => api.post(scoped(id, `asignaciones/${encodeURIComponent(assignmentId)}/revocar/`), {}),
};
