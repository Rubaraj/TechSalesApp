import type { Enrollment, EnrollmentType, EnrollmentPeriod, EnrollmentStatus } from '../types';
import type { ServiceResponse } from './baseService';
import enrollmentsData from '../data/runtime/enrollments.json';
import { delay, generateId, formatDate } from './baseService';

// In-memory data store
let enrollments: Enrollment[] = (enrollmentsData as unknown) as Enrollment[];

// Get all enrollments
export const getAllEnrollments = async (): Promise<ServiceResponse<Enrollment[]>> => {
  await delay();
  return { success: true, data: enrollments };
};

// Get enrollments by agent ID
export const getEnrollmentsByAgent = async (agentId: string): Promise<ServiceResponse<Enrollment[]>> => {
  await delay();
  const agentEnrollments = enrollments.filter(e => e.agentId === agentId);
  return { success: true, data: agentEnrollments };
};

// Get enrollments by lead ID
export const getEnrollmentsByLead = async (leadId: string): Promise<ServiceResponse<Enrollment[]>> => {
  await delay();
  const leadEnrollments = enrollments.filter(e => e.leadId === leadId);
  return { success: true, data: leadEnrollments };
};

// Create new enrollment
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

export const createEnrollment = async (
  data: CreateEnrollmentData,
  createdBy: string
): Promise<ServiceResponse<Enrollment>> => {
  await delay();
  
  const newEnrollment: Enrollment = {
    enrollmentId: generateId('ENROLL'),
    ...data,
    premium: data.premium || 0,
    medicaidEligible: data.medicaidEligible || false,
    createdAt: formatDate(),
    createdBy,
  };
  
  enrollments.push(newEnrollment);
  
  return { success: true, data: newEnrollment };
};

