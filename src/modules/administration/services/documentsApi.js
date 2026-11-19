import { api, downloadPrivateFile } from '../../../lib/api.js';

const uuid = value => {
  const result = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error('Identificador de empresa o documento inválido.');
  }
  return encodeURIComponent(result);
};
const worker = value => {
  const result = String(value || '');
  if (!result || result.length > 128) throw new Error('Trabajador inválido.');
  return encodeURIComponent(result);
};
const root = empresaId => `/documentos/empresas/${uuid(empresaId)}`;
const records = (empresaId, trabajadorId) => `${root(empresaId)}/trabajadores/${worker(trabajadorId)}/documentos/`;
const document = (empresaId, trabajadorId, documentoId) => `${records(empresaId, trabajadorId)}${uuid(documentoId)}/`;

export const documentsApi = {
  types: async empresaId => (await api.get(`${root(empresaId)}/tipos/`)).results || [],
  createType: (empresaId, data) => api.post(`${root(empresaId)}/tipos/`, data),
  updateType: (empresaId, tipoId, data) => api.patch(`${root(empresaId)}/tipos/${uuid(tipoId)}/`, data),
  requirements: async empresaId => (await api.get(`${root(empresaId)}/requisitos/`)).results || [],
  createRequirement: (empresaId, data) => api.post(`${root(empresaId)}/requisitos/`, data),
  updateRequirement: (empresaId, requisitoId, data) => api.patch(`${root(empresaId)}/requisitos/${uuid(requisitoId)}/`, data),
  records: async (empresaId, trabajadorId) => (await api.get(records(empresaId, trabajadorId))).results || [],
  create: (empresaId, trabajadorId, data) => api.post(records(empresaId, trabajadorId), data),
  review: (empresaId, trabajadorId, documentoId, data) => api.patch(`${document(empresaId, trabajadorId, documentoId)}revision/`, data),
  files: async (empresaId, trabajadorId, documentoId) =>
    (await api.get(`${document(empresaId, trabajadorId, documentoId)}archivos/`)).results || [],
  filesAndHistory: (empresaId, trabajadorId, documentoId) =>
    api.get(`${document(empresaId, trabajadorId, documentoId)}archivos/`),
  compliance: (empresaId, trabajadorId, obraId = null) =>
    api.get(
      `${root(empresaId)}/trabajadores/${worker(trabajadorId)}/cumplimiento/${
        obraId ? `?obra_id=${encodeURIComponent(obraId)}` : ''
      }`,
    ),
  alertsConfig: empresaId => api.get(`${root(empresaId)}/alertas/configuracion/`),
  updateAlertsConfig: (empresaId, data) => api.patch(`${root(empresaId)}/alertas/configuracion/`, data),
  alerts: (empresaId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.leida !== undefined) qs.set('leida', String(params.leida));
    if (params.nivel) qs.set('nivel', params.nivel);
    if (params.entidad_tipo) qs.set('entidad_tipo', params.entidad_tipo);
    if (params.obra_id) qs.set('obra_id', params.obra_id);
    const query = qs.toString();
    return api.get(`${root(empresaId)}/alertas/${query ? `?${query}` : ''}`);
  },
  syncAlerts: empresaId => api.post(`${root(empresaId)}/alertas/`, {}),
  markAlert: (empresaId, alertaId, leida = true) =>
    api.patch(`${root(empresaId)}/alertas/${uuid(alertaId)}/`, { leida }),
  upload: (empresaId, trabajadorId, documentoId, file) => {
    const form = new FormData();
    form.append('archivo', file, file.name);
    return api.post(`${document(empresaId, trabajadorId, documentoId)}archivos/`, form);
  },
  download: (empresaId, trabajadorId, documentoId, fileId, suggestedName) =>
    downloadPrivateFile(`${document(empresaId, trabajadorId, documentoId)}archivos/${uuid(fileId)}/descargar/`, suggestedName),

  // Etapa 7: Documentos de empresa
  companyDocuments: async (empresaId, obraId = null) =>
    (await api.get(`${root(empresaId)}/documentos-empresa/${obraId ? `?obra_id=${encodeURIComponent(obraId)}` : ''}`)).results || [],
  createCompanyDocument: (empresaId, data) => api.post(`${root(empresaId)}/documentos-empresa/`, data),
  reviewCompanyDocument: (empresaId, documentoId, data) =>
    api.patch(`${root(empresaId)}/documentos-empresa/${uuid(documentoId)}/revision/`, data),
  companyDocumentFiles: (empresaId, documentoId) =>
    api.get(`${root(empresaId)}/documentos-empresa/${uuid(documentoId)}/archivos/`),
  uploadCompanyDocument: (empresaId, documentoId, file) => {
    const form = new FormData();
    form.append('archivo', file, file.name);
    return api.post(`${root(empresaId)}/documentos-empresa/${uuid(documentoId)}/archivos/`, form);
  },
  downloadCompanyDocument: (empresaId, documentoId, archivoId, suggestedName) =>
    downloadPrivateFile(`${root(empresaId)}/documentos-empresa/${uuid(documentoId)}/archivos/${uuid(archivoId)}/descargar/`, suggestedName),
  companyCompliance: (empresaId, obraId = null) =>
    api.get(`${root(empresaId)}/cumplimiento-empresa/${obraId ? `?obra_id=${encodeURIComponent(obraId)}` : ''}`),

  // Etapa 8: Equipos y maquinaria
  equipmentList: async empresaId => (await api.get(`${root(empresaId)}/equipos/`)).results || [],
  createEquipment: (empresaId, data) => api.post(`${root(empresaId)}/equipos/`, data),
  updateEquipment: (empresaId, equipoId, data) => api.patch(`${root(empresaId)}/equipos/${uuid(equipoId)}/`, data),
  equipmentAssignments: async (empresaId, equipoId) =>
    (await api.get(`${root(empresaId)}/equipos/${uuid(equipoId)}/asignaciones/`)).results || [],
  createEquipmentAssignment: (empresaId, equipoId, data) =>
    api.post(`${root(empresaId)}/equipos/${uuid(equipoId)}/asignaciones/`, data),
  updateEquipmentAssignment: (empresaId, equipoId, asignacionId, data) =>
    api.patch(`${root(empresaId)}/equipos/${uuid(equipoId)}/asignaciones/${uuid(asignacionId)}/`, data),
  equipmentDocuments: async (empresaId, equipoId) =>
    (await api.get(`${root(empresaId)}/equipos/${uuid(equipoId)}/documentos/`)).results || [],
  createEquipmentDocument: (empresaId, equipoId, data) =>
    api.post(`${root(empresaId)}/equipos/${uuid(equipoId)}/documentos/`, data),
  reviewEquipmentDocument: (empresaId, equipoId, documentoId, data) =>
    api.patch(`${root(empresaId)}/equipos/${uuid(equipoId)}/documentos/${uuid(documentoId)}/revision/`, data),
  equipmentDocumentFiles: (empresaId, equipoId, documentoId) =>
    api.get(`${root(empresaId)}/equipos/${uuid(equipoId)}/documentos/${uuid(documentoId)}/archivos/`),
  uploadEquipmentDocument: (empresaId, equipoId, documentoId, file) => {
    const form = new FormData();
    form.append('archivo', file, file.name);
    return api.post(`${root(empresaId)}/equipos/${uuid(equipoId)}/documentos/${uuid(documentoId)}/archivos/`, form);
  },
  downloadEquipmentDocument: (empresaId, equipoId, documentoId, archivoId, suggestedName) =>
    downloadPrivateFile(`${root(empresaId)}/equipos/${uuid(equipoId)}/documentos/${uuid(documentoId)}/archivos/${uuid(archivoId)}/descargar/`, suggestedName),
  equipmentCompliance: (empresaId, equipoId, obraId = null) =>
    api.get(`${root(empresaId)}/equipos/${uuid(equipoId)}/cumplimiento/${obraId ? `?obra_id=${encodeURIComponent(obraId)}` : ''}`),

  // Etapa 9: Capacitaciones, EPP y habilitación preventiva
  trainingTypes: async empresaId => (await api.get(`${root(empresaId)}/capacitaciones/tipos/`)).results || [],
  createTrainingType: (empresaId, data) => api.post(`${root(empresaId)}/capacitaciones/tipos/`, data),
  updateTrainingType: (empresaId, tipoId, data) => api.patch(`${root(empresaId)}/capacitaciones/tipos/${uuid(tipoId)}/`, data),
  trainingRequirements: async empresaId => (await api.get(`${root(empresaId)}/capacitaciones/requisitos/`)).results || [],
  createTrainingRequirement: (empresaId, data) => api.post(`${root(empresaId)}/capacitaciones/requisitos/`, data),
  workerTrainings: async (empresaId, trabajadorId) =>
    (await api.get(`${root(empresaId)}/trabajadores/${worker(trabajadorId)}/capacitaciones/`)).results || [],
  createWorkerTraining: (empresaId, trabajadorId, data) =>
    api.post(`${root(empresaId)}/trabajadores/${worker(trabajadorId)}/capacitaciones/`, data),
  eppCategories: async empresaId => (await api.get(`${root(empresaId)}/epp/categorias/`)).results || [],
  createEppCategory: (empresaId, data) => api.post(`${root(empresaId)}/epp/categorias/`, data),
  workerEpp: async (empresaId, trabajadorId) =>
    (await api.get(`${root(empresaId)}/trabajadores/${worker(trabajadorId)}/epp/`)).results || [],
  createWorkerEpp: (empresaId, trabajadorId, data) =>
    api.post(`${root(empresaId)}/trabajadores/${worker(trabajadorId)}/epp/`, data),
  preventiveQualification: (empresaId, trabajadorId, obraId = null) =>
    api.get(`${root(empresaId)}/trabajadores/${worker(trabajadorId)}/habilitacion-preventiva/${obraId ? `?obra_id=${encodeURIComponent(obraId)}` : ''}`),

  // Etapa 10: Dashboard y exportación de cumplimiento
  complianceDashboard: (empresaId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.obra_id) qs.set('obra_id', params.obra_id);
    if (params.cargo_id) qs.set('cargo_id', params.cargo_id);
    if (params.estado) qs.set('estado', params.estado);
    const query = qs.toString();
    return api.get(`${root(empresaId)}/dashboard-cumplimiento/${query ? `?${query}` : ''}`);
  },
  exportComplianceCsv: (empresaId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.obra_id) qs.set('obra_id', params.obra_id);
    if (params.cargo_id) qs.set('cargo_id', params.cargo_id);
    if (params.estado) qs.set('estado', params.estado);
    const query = qs.toString();
    return downloadPrivateFile(`${root(empresaId)}/exportar-cumplimiento/${query ? `?${query}` : ''}`, 'cumplimiento_tocal.csv');
  },
  seedTocalCatalogs: empresaId => api.post(`${root(empresaId)}/sembrar-catalogos-tocal/`, {}),

  // RF-06, RF-12, RF-15, RF-16: Hombre Nuevo, Checklists Digitales, Consulta en Terreno y Dossier FUF / DS 44
  registerHombreNuevo: (empresaId, trabajadorId, data = {}) =>
    api.post(`${root(empresaId)}/trabajadores/${worker(trabajadorId)}/hombre-nuevo/`, data),
  registerCrewSafetyTalk: (empresaId, data = {}) =>
    api.post(`${root(empresaId)}/charla-cuadrilla/`, data),
  fieldLookup: async (empresaId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.obra_id) qs.set('obra_id', params.obra_id);
    const query = qs.toString();
    return (await api.get(`${root(empresaId)}/consulta-terreno/${query ? `?${query}` : ''}`)).results || [];
  },
  fieldLookupFull: async (empresaId, params = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.obra_id) qs.set('obra_id', params.obra_id);
    const query = qs.toString();
    return api.get(`${root(empresaId)}/consulta-terreno/${query ? `?${query}` : ''}`);
  },
  checklists: async (empresaId, obraId = null) =>
    (await api.get(`${root(empresaId)}/checklists/${obraId ? `?obra_id=${encodeURIComponent(obraId)}` : ''}`)).results || [],
  createChecklist: (empresaId, data) => api.post(`${root(empresaId)}/checklists/`, data),
  dossierFufDs44: (empresaId, obraId = null) =>
    api.get(`${root(empresaId)}/dossier-fuf-ds44/${obraId ? `?obra_id=${encodeURIComponent(obraId)}` : ''}`),
};
