import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage for Node environment before importing state.js
globalThis.localStorage = {
  _store: new Map(),
  getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
  setItem(k, v) { this._store.set(k, String(v)); },
  removeItem(k) { this._store.delete(k); },
};

const { state, can, canGlobal, canAccessSales, clearCompanyContext } = await import('../src/lib/state.js');
const { num, pct, date, obraPath } = await import('../src/lib/format.js');
const { documentsApi } = await import('../src/modules/administration/services/documentsApi.js');

test('T1.5 / T13.4 — RBAC state helpers validate active company and obra-scoped permissions', () => {
  clearCompanyContext();
  assert.equal(can('documentos.ver'), false, 'Sin empresa activa no debe otorgar permisos');

  const empA = 'd4825b17-6bf6-4838-a294-bb5c20d69d4d';
  const empB = '11111111-2222-3333-4444-555555555555';
  state.activeCompanyId = empA;
  state.permissionsCompanyId = empB;
  state.permissions = ['documentos.ver'];
  assert.equal(can('documentos.ver'), false, 'Desfase entre activeCompanyId y permissionsCompanyId debe denegar acceso');

  state.permissionsCompanyId = empA;
  state.permissions = ['documentos.ver', 'obras.ver'];
  state.globalPermissions = ['obras.ver'];
  state.obraPermissions = { 'obra-norte': ['documentos.ver', 'documentos.aprobar'] };

  assert.equal(can('obras.ver'), true);
  assert.equal(canGlobal('obras.ver'), true);
  assert.equal(canGlobal('documentos.aprobar'), false);
  assert.equal(can('documentos.aprobar', 'obra-norte'), true);
  assert.equal(can('documentos.aprobar', 'obra-sur'), false);

  clearCompanyContext();
  assert.equal(state.activeCompanyId, '');
  assert.deepEqual(state.permissions, []);
  assert.equal(can('obras.ver'), false);
});

test('T1.5 — canAccessSales restricts sales module when RBAC is active', () => {
  state.user = { role: 'gerencia' };
  state.rbac = true;
  assert.equal(canAccessSales(), false);

  state.rbac = false;
  assert.equal(canAccessSales(), true);
});

test('T13.4 — documentsApi validates UUID format to prevent path injection', () => {
  assert.throws(
    () => documentsApi.alerts('empresa-invalida-no-uuid'),
    /Identificador de empresa o documento inválido/
  );
});

test('T13.4 — format helpers generate expected Chilean locale and obra routes', () => {
  assert.equal(date('2026-11-10'), '10/11/2026');
  assert.equal(obraPath('obra-1'), '/obras/obra-1');
  assert.equal(obraPath('obra-1', 'resumen'), '/obras/obra-1');
  assert.equal(obraPath('obra-1', 'pdr'), '/obras/obra-1/pdr');
  assert.equal(pct(0.85), '85 %');
  assert.ok(num(1500).includes('1'));
});
