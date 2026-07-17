/**
 * Phase C — read access to `memberAppointments`. There is no full repository
 * for appointments (they are member-portal seed data, written nowhere in the
 * backend yet), so this thin reader covers the two Atlas read tools:
 * Mongo collection when connected, bootstrap JSON file otherwise.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { appConn } from '../config/mongo.js';
import { BOOTSTRAP_PATHS } from '../utils/bootstrap.js';

export interface MemberAppointment {
  appointmentId: string;
  memberId: string;
  agentId: string;
  agentName?: string;
  appointmentType?: string;
  scheduledDate: string;
  scheduledTime?: string;
  status?: string;
  notes?: string;
}

export async function getAppointmentsForAgent(agentId: string): Promise<MemberAppointment[]> {
  if (appConn) {
    const docs = await appConn
      .collection('memberAppointments')
      .find({ agentId }, { projection: { _id: 0 } })
      .toArray();
    return docs as unknown as MemberAppointment[];
  }
  const raw = await fs.readFile(
    path.join(BOOTSTRAP_PATHS.runtimeDir, 'memberAppointments.json'),
    'utf8',
  );
  const all = JSON.parse(raw) as MemberAppointment[];
  return all.filter((a) => a.agentId === agentId);
}
