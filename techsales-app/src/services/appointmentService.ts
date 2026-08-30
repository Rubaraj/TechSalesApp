import type { MemberAppointment } from '../types';
import type { ServiceResponse } from './baseService';
import { apiGet } from '../api/apiClient';
import { getMode } from '../api/mode';
import appointmentsData from '../data/runtime/memberAppointments.json';
import { delay } from './baseService';
import { inPeriod } from '../utils/drilldown';

const _appointments: MemberAppointment[] = appointmentsData as MemberAppointment[];

export interface AppointmentQuery {
  agentId?: string;
  /** Inclusive lower bound (ISO). */
  from?: string | null;
  /** EXCLUSIVE upper bound (ISO), matching the API's period windows. */
  to?: string | null;
}

const _listApi = (q: AppointmentQuery): Promise<ServiceResponse<MemberAppointment[]>> => {
  const sp = new URLSearchParams();
  if (q.agentId) sp.set('agentId', q.agentId);
  if (q.from) sp.set('from', q.from);
  if (q.to) sp.set('to', q.to);
  const qs = sp.toString();
  return apiGet<MemberAppointment[]>(`/appointments${qs ? `?${qs}` : ''}`);
};

const _listLocal = async (q: AppointmentQuery): Promise<ServiceResponse<MemberAppointment[]>> => {
  await delay(200);
  let rows = [..._appointments];
  if (q.agentId) rows = rows.filter((a) => a.agentId === q.agentId);
  rows = rows.filter((a) => inPeriod(a.scheduledDate, q.from, q.to));
  rows.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return { success: true, data: rows };
};

export const getAppointments = (
  q: AppointmentQuery = {},
): Promise<ServiceResponse<MemberAppointment[]>> =>
  getMode() === 'local' ? _listLocal(q) : _listApi(q);
