import type { Target, TargetFormData } from '../types';
import type { ServiceResponse } from './baseService';
import targetsData from '../data/runtime/targets.json';
import { delay, generateId, formatDate, filterByField } from './baseService';

let targets: Target[] = (targetsData as unknown) as Target[];

export const getAllTargets = async (): Promise<ServiceResponse<Target[]>> => {
  await delay();
  return { success: true, data: [...targets] };
};

export const getTargetById = async (targetId: string): Promise<ServiceResponse<Target>> => {
  await delay();
  const target = targets.find(t => t.targetId === targetId);
  
  if (!target) {
    return { success: false, error: 'Target not found' };
  }
  
  return { success: true, data: target };
};

export const getTargetsByPeriod = async (period: string): Promise<ServiceResponse<Target[]>> => {
  await delay();
  const filtered = filterByField(targets, 'period', period);
  return { success: true, data: filtered };
};

export const getTargetsByMetric = async (metric: string): Promise<ServiceResponse<Target[]>> => {
  await delay();
  const filtered = filterByField(targets, 'metric', metric);
  return { success: true, data: filtered };
};

export const getActiveTargets = async (): Promise<ServiceResponse<Target[]>> => {
  await delay();
  const active = targets.filter(t => t.isActive);
  return { success: true, data: active };
};

export const createTarget = async (
  data: TargetFormData,
  createdBy: string
): Promise<ServiceResponse<Target>> => {
  await delay();
  
  const newTarget: Target = {
    targetId: generateId('TARGET'),
    ...data,
    createdAt: formatDate(),
    createdBy,
  };
  
  targets.push(newTarget);
  
  // In a real app, this would be an API call
  // For now, we'll simulate saving
  return { success: true, data: newTarget };
};

export const updateTarget = async (
  targetId: string,
  data: Partial<TargetFormData>,
  updatedBy: string
): Promise<ServiceResponse<Target>> => {
  await delay();
  
  const index = targets.findIndex(t => t.targetId === targetId);
  
  if (index === -1) {
    return { success: false, error: 'Target not found' };
  }
  
  targets[index] = {
    ...targets[index],
    ...data,
    updatedAt: formatDate(),
    updatedBy,
  };
  
  return { success: true, data: targets[index] };
};

export const deleteTarget = async (targetId: string): Promise<ServiceResponse<void>> => {
  await delay();
  
  const index = targets.findIndex(t => t.targetId === targetId);
  
  if (index === -1) {
    return { success: false, error: 'Target not found' };
  }
  
  targets.splice(index, 1);
  
  return { success: true };
};

export const toggleTargetStatus = async (
  targetId: string,
  updatedBy: string
): Promise<ServiceResponse<Target>> => {
  await delay();
  
  const index = targets.findIndex(t => t.targetId === targetId);
  
  if (index === -1) {
    return { success: false, error: 'Target not found' };
  }
  
  targets[index] = {
    ...targets[index],
    isActive: !targets[index].isActive,
    updatedAt: formatDate(),
    updatedBy,
  };
  
  return { success: true, data: targets[index] };
};

