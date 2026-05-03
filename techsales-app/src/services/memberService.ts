import type { Member, MemberAppointment } from '../types';
import type { ServiceResponse } from './baseService';
import { apiGet, apiPost } from '../api/apiClient';
import { getMode } from '../api/mode';
import membersData from '../data/runtime/members.json';
import appointmentsData from '../data/runtime/memberAppointments.json';
import { delay } from './baseService';

const _members: Member[] = membersData as Member[];
const _appointments: MemberAppointment[] = appointmentsData as MemberAppointment[];

// ---------------- API-mode helpers ----------------

const _memberLoginApi = async (
  policyNumber: string,
  dateOfBirth: string
): Promise<ServiceResponse<Member>> => {
  const res = await apiPost<{ member: Member }>('/auth/member-login', { policyNumber, dateOfBirth });
  if (!res.success || !res.data) {
    return { success: false, error: res.error ?? 'Invalid policy number or date of birth' };
  }
  return { success: true, data: res.data.member };
};

const _getMemberByIdApi = (memberId: string): Promise<ServiceResponse<Member>> =>
  apiGet<Member>(`/members/${encodeURIComponent(memberId)}`);

const _getAppointmentsApi = (memberId: string): Promise<ServiceResponse<MemberAppointment[]>> =>
  apiGet<MemberAppointment[]>(`/members/${encodeURIComponent(memberId)}/appointments`);

// ---------------- Local-mode helpers ----------------

const _memberLoginLocal = async (
  policyNumber: string,
  dateOfBirth: string
): Promise<ServiceResponse<Member>> => {
  await delay(500);
  const member = _members.find(
    m => m.policyNumber.toLowerCase() === policyNumber.toLowerCase().trim()
      && m.dateOfBirth === dateOfBirth
      && m.isActive
  );
  if (!member) return { success: false, error: 'Invalid policy number or date of birth' };
  return { success: true, data: member };
};

const _getMemberByIdLocal = async (memberId: string): Promise<ServiceResponse<Member>> => {
  await delay(300);
  const member = _members.find(m => m.memberId === memberId && m.isActive);
  if (!member) return { success: false, error: 'Member not found' };
  return { success: true, data: member };
};

const _getAppointmentsLocal = async (memberId: string): Promise<ServiceResponse<MemberAppointment[]>> => {
  await delay(300);
  return {
    success: true,
    data: _appointments.filter(a => a.memberId === memberId && a.status === 'Scheduled'),
  };
};

// ---------------- Public surface ----------------

export const memberLogin = (
  policyNumber: string,
  dateOfBirth: string
): Promise<ServiceResponse<Member>> =>
  // Member login is the entry point that DECIDES the mode (parallels agent login in
  // AuthContext). Always tries the API first; falls back to local on network error
  // so the offline demo path keeps working.
  getMode() === 'local' ? _memberLoginLocal(policyNumber, dateOfBirth) : _memberLoginApi(policyNumber, dateOfBirth);

export const getMemberById = (memberId: string): Promise<ServiceResponse<Member>> =>
  getMode() === 'local' ? _getMemberByIdLocal(memberId) : _getMemberByIdApi(memberId);

export const getMemberAppointments = (
  memberId: string
): Promise<ServiceResponse<MemberAppointment[]>> =>
  getMode() === 'local' ? _getAppointmentsLocal(memberId) : _getAppointmentsApi(memberId);
