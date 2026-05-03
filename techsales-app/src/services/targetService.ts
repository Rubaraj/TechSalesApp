import type { Target, TargetFormData } from '../types';
import type { ServiceResponse } from './baseService';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/apiClient';
import { getMode } from '../api/mode';
import targetsData from '../data/runtime/targets.json';
import { delay, generateId, formatDate, filterByField } from './baseService';

const _targets: Target[] = (targetsData as unknown) as Target[];

// ---------------- API helpers ----------------

const _getAllApi = (): Promise<ServiceResponse<Target[]>> => apiGet<Target[]>('/targets');
const _getByIdApi = (id: string): Promise<ServiceResponse<Target>> => apiGet<Target>(`/targets/${encodeURIComponent(id)}`);
const _byPeriodApi = (p: string): Promise<ServiceResponse<Target[]>> => apiGet<Target[]>(`/targets/by-period/${encodeURIComponent(p)}`);
const _byMetricApi = (m: string): Promise<ServiceResponse<Target[]>> => apiGet<Target[]>(`/targets/by-metric/${encodeURIComponent(m)}`);
const _activeApi = (): Promise<ServiceResponse<Target[]>> => apiGet<Target[]>('/targets/active');
const _createApi = (data: TargetFormData, createdBy: string): Promise<ServiceResponse<Target>> =>
  apiPost<Target>('/targets', { ...data, createdBy });
const _updateApi = (id: string, data: Partial<TargetFormData>, updatedBy: string): Promise<ServiceResponse<Target>> =>
  apiPatch<Target>(`/targets/${encodeURIComponent(id)}`, { ...data, updatedBy });
const _deleteApi = (id: string): Promise<ServiceResponse<void>> =>
  apiDelete<void>(`/targets/${encodeURIComponent(id)}`);
const _toggleApi = (id: string, updatedBy: string): Promise<ServiceResponse<Target>> =>
  apiPost<Target>(`/targets/${encodeURIComponent(id)}/toggle-status`, { updatedBy });

// ---------------- Local helpers ----------------

const _getAllLocal = async (): Promise<ServiceResponse<Target[]>> => {
  await delay();
  return { success: true, data: [..._targets] };
};
const _getByIdLocal = async (id: string): Promise<ServiceResponse<Target>> => {
  await delay();
  const t = _targets.find(x => x.targetId === id);
  return t ? { success: true, data: t } : { success: false, error: 'Target not found' };
};
const _byPeriodLocal = async (period: string): Promise<ServiceResponse<Target[]>> => {
  await delay();
  return { success: true, data: filterByField(_targets, 'period', period) };
};
const _byMetricLocal = async (metric: string): Promise<ServiceResponse<Target[]>> => {
  await delay();
  return { success: true, data: filterByField(_targets, 'metric', metric) };
};
const _activeLocal = async (): Promise<ServiceResponse<Target[]>> => {
  await delay();
  return { success: true, data: _targets.filter(t => t.isActive) };
};
const _createLocal = async (data: TargetFormData, createdBy: string): Promise<ServiceResponse<Target>> => {
  await delay();
  const t: Target = { targetId: generateId('TARGET'), ...data, createdAt: formatDate(), createdBy };
  _targets.push(t);
  return { success: true, data: t };
};
const _updateLocal = async (id: string, data: Partial<TargetFormData>, updatedBy: string): Promise<ServiceResponse<Target>> => {
  await delay();
  const i = _targets.findIndex(t => t.targetId === id);
  if (i === -1) return { success: false, error: 'Target not found' };
  _targets[i] = { ..._targets[i], ...data, updatedAt: formatDate(), updatedBy };
  return { success: true, data: _targets[i] };
};
const _deleteLocal = async (id: string): Promise<ServiceResponse<void>> => {
  await delay();
  const i = _targets.findIndex(t => t.targetId === id);
  if (i === -1) return { success: false, error: 'Target not found' };
  _targets.splice(i, 1);
  return { success: true };
};
const _toggleLocal = async (id: string, updatedBy: string): Promise<ServiceResponse<Target>> => {
  await delay();
  const i = _targets.findIndex(t => t.targetId === id);
  if (i === -1) return { success: false, error: 'Target not found' };
  _targets[i] = { ..._targets[i], isActive: !_targets[i].isActive, updatedAt: formatDate(), updatedBy };
  return { success: true, data: _targets[i] };
};

// ---------------- Public surface ----------------

export const getAllTargets = (): Promise<ServiceResponse<Target[]>> =>
  getMode() === 'local' ? _getAllLocal() : _getAllApi();

export const getTargetById = (targetId: string): Promise<ServiceResponse<Target>> =>
  getMode() === 'local' ? _getByIdLocal(targetId) : _getByIdApi(targetId);

export const getTargetsByPeriod = (period: string): Promise<ServiceResponse<Target[]>> =>
  getMode() === 'local' ? _byPeriodLocal(period) : _byPeriodApi(period);

export const getTargetsByMetric = (metric: string): Promise<ServiceResponse<Target[]>> =>
  getMode() === 'local' ? _byMetricLocal(metric) : _byMetricApi(metric);

export const getActiveTargets = (): Promise<ServiceResponse<Target[]>> =>
  getMode() === 'local' ? _activeLocal() : _activeApi();

export const createTarget = (data: TargetFormData, createdBy: string): Promise<ServiceResponse<Target>> =>
  getMode() === 'local' ? _createLocal(data, createdBy) : _createApi(data, createdBy);

export const updateTarget = (targetId: string, data: Partial<TargetFormData>, updatedBy: string): Promise<ServiceResponse<Target>> =>
  getMode() === 'local' ? _updateLocal(targetId, data, updatedBy) : _updateApi(targetId, data, updatedBy);

export const deleteTarget = (targetId: string): Promise<ServiceResponse<void>> =>
  getMode() === 'local' ? _deleteLocal(targetId) : _deleteApi(targetId);

export const toggleTargetStatus = (targetId: string, updatedBy: string): Promise<ServiceResponse<Target>> =>
  getMode() === 'local' ? _toggleLocal(targetId, updatedBy) : _toggleApi(targetId, updatedBy);
