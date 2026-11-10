import { api } from '../../../lib/api';
import { state } from '../../../lib/state';
const companyId = () => state.activeCompanyId;
const endpoint = (obraId = null) => {
  if (!/^[0-9a-f-]{36}$/i.test(companyId() || '')) throw new Error('Selecciona una empresa activa');
  const base = `/authorization/empresas/${companyId()}/obras/`;
  return obraId !== null && obraId !== undefined ? `${base}${encodeURIComponent(obraId)}/` : base;
};
export const worksApi = {
  list: () => api.get(endpoint()),
  detail: (obraId) => api.get(endpoint(obraId)),
  create: (values) => api.post(endpoint(), values),
  update: (obraId, values) => api.patch(endpoint(obraId), values),
};
