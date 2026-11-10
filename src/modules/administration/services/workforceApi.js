import { api } from '../../../lib/api';

const id = value => encodeURIComponent(String(value));
const company = empresaId => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(empresaId || ''))) {
    throw new Error('No hay una empresa activa válida');
  }
  return `/empresas/${id(empresaId)}`;
};
const list = data => data.results || [];
export const workforceApi = {
  cargos: async empresaId => list(await api.get(`${company(empresaId)}/cargos`)),
  seedTocalCargos: empresaId => api.post(`${company(empresaId)}/cargos/catalogo-tocal`, {}),
  createCargo: (empresaId, payload) => api.post(`${company(empresaId)}/cargos`, payload),
  updateCargo: (empresaId, cargoId, payload) => api.patch(`${company(empresaId)}/cargos/${id(cargoId)}`, payload),
  detalleTrabajador: (empresaId, trabajadorId) => api.get(`${company(empresaId)}/trabajadores/${id(trabajadorId)}`),
  trabajadores: async (empresaId, params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return list(await api.get(`${company(empresaId)}/trabajadores${suffix}`));
  },
  createTrabajador: (empresaId, payload) => api.post(`${company(empresaId)}/trabajadores`, payload),
  updateTrabajador: (empresaId, trabajadorId, payload) => api.patch(`${company(empresaId)}/trabajadores/${id(trabajadorId)}`, payload),
  deactivateTrabajador: (empresaId, trabajadorId) => api.del(`${company(empresaId)}/trabajadores/${id(trabajadorId)}`),
  asignaciones: async (empresaId, obraId) => list(await api.get(`${company(empresaId)}/obras/${id(obraId)}/trabajadores/asignaciones`)),
  createAsignacion: (empresaId, obraId, payload) => api.post(`${company(empresaId)}/obras/${id(obraId)}/trabajadores/asignaciones`, payload),
  updateAsignacion: (empresaId, obraId, asignacionId, payload) => api.patch(`${company(empresaId)}/obras/${id(obraId)}/trabajadores/asignaciones/${id(asignacionId)}`, payload),
};
