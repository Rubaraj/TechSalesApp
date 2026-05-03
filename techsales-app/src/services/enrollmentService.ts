import type { Enrollment, EnrollmentType, EnrollmentPeriod, EnrollmentStatus } from '../types';
import type { ServiceResponse } from './baseService';
import { apiGet, apiPost } from '../api/apiClient';
import { getMode } from '../api/mode';
import enrollmentsData from '../data/runtime/enrollments.json';
import { delay, generateId, formatDate } from './baseService';

// Local in-memory store (used in 'local' mode and as the FE bundled fallback).
const _enrollments: Enrollment[] = (enrollmentsData as unknown) as Enrollment[];

export interface CreateEnrollmentData {
  leadId: string;
  planId: string;
  agentId: string;
  enrollmentDate: string;
  effectiveDate: string;
  enrollmentType: EnrollmentType;
  enrollmentPeriod: EnrollmentPeriod;
  status: EnrollmentStatus;
  premium?: number;
  medicaidEligible?: boolean;
  lisLevel?: number;
  notes?: string;
}

// ---------------- API-mode helpers ----------------

const _getAllEnrollmentsApi = (): Promise<ServiceResponse<Enrollment[]>> => apiGet<Enrollment[]>('/enrollments');
const _getByAgentApi = (agentId: string): Promise<ServiceResponse<Enrollment[]>> => apiGet<Enrollment[]>(`/enrollments?agentId=${encodeURIComponent(agentId)}`);
const _getByLeadApi = (leadId: string): Promise<ServiceResponse<Enrollment[]>> => apiGet<Enrollment[]>(`/enrollments?leadId=${encodeURIComponent(leadId)}`);
const _createApi = (data: CreateEnrollmentData, createdBy: string): Promise<ServiceResponse<Enrollment>> =>
  apiPost<Enrollment>('/enrollments', { ...data, createdBy });

// ---------------- Local-mode helpers ----------------

const _getAllEnrollmentsLocal = async (): Promise<ServiceResponse<Enrollment[]>> => {
  await delay();
  return { success: true, data: _enrollments };
};
const _getByAgentLocal = async (agentId: string): Promise<ServiceResponse<Enrollment[]>> => {
  await delay();
  return { success: true, data: _enrollments.filter(e => e.agentId === agentId) };
};
const _getByLeadLocal = async (leadId: string): Promise<ServiceResponse<Enrollment[]>> => {
  await delay();
  return { success: true, data: _enrollments.filter(e => e.leadId === leadId) };
};
const _createLocal = async (data: CreateEnrollmentData, createdBy: string): Promise<ServiceResponse<Enrollment>> => {
  await delay();
  const e: Enrollment = {
    enrollmentId: generateId('ENROLL'),
    ...data,
    premium: data.premium ?? 0,
    medicaidEligible: data.medicaidEligible ?? false,
    createdAt: formatDate(),
    createdBy,
  };
  _enrollments.push(e);
  return { success: true, data: e };
};

// ---------------- Public surface (mode-aware wrappers) ----------------

export const getAllEnrollments = (): Promise<ServiceResponse<Enrollment[]>> =>
  getMode() === 'local' ? _getAllEnrollmentsLocal() : _getAllEnrollmentsApi();

export const getEnrollmentsByAgent = (agentId: string): Promise<ServiceResponse<Enrollment[]>> =>
  getMode() === 'local' ? _getByAgentLocal(agentId) : _getByAgentApi(agentId);

export const getEnrollmentsByLead = (leadId: string): Promise<ServiceResponse<Enrollment[]>> =>
  getMode() === 'local' ? _getByLeadLocal(leadId) : _getByLeadApi(leadId);

export const createEnrollment = (
  data: CreateEnrollmentData,
  createdBy: string
): Promise<ServiceResponse<Enrollment>> =>
  getMode() === 'local' ? _createLocal(data, createdBy) : _createApi(data, createdBy);
