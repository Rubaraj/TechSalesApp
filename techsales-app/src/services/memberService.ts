import type { Member, MemberAppointment } from '../types';
import type { ServiceResponse } from './baseService';
import membersData from '../data/runtime/members.json';
import appointmentsData from '../data/runtime/memberAppointments.json';
import { delay } from './baseService';

const members: Member[] = membersData as Member[];
const appointments: MemberAppointment[] = appointmentsData as MemberAppointment[];

// Member login by policy number and DOB
export const memberLogin = async (
  policyNumber: string,
  dateOfBirth: string
): Promise<ServiceResponse<Member>> => {
  await delay(500);
  
  const member = members.find(
    m => 
      m.policyNumber.toLowerCase() === policyNumber.toLowerCase().trim() &&
      m.dateOfBirth === dateOfBirth &&
      m.isActive
  );
  
  if (!member) {
    return { success: false, error: 'Invalid policy number or date of birth' };
  }
  
  return { success: true, data: member };
};

// Get member by ID
export const getMemberById = async (memberId: string): Promise<ServiceResponse<Member>> => {
  await delay(300);
  
  const member = members.find(m => m.memberId === memberId && m.isActive);
  
  if (!member) {
    return { success: false, error: 'Member not found' };
  }
  
  return { success: true, data: member };
};

// Get member appointments
export const getMemberAppointments = async (
  memberId: string
): Promise<ServiceResponse<MemberAppointment[]>> => {
  await delay(300);
  
  const memberAppointments = appointments.filter(
    a => a.memberId === memberId && a.status === 'Scheduled'
  );
  
  return { success: true, data: memberAppointments };
};
