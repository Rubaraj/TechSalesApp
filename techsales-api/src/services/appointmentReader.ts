/**
 * Phase C — read access to `memberAppointments`. There is no full repository
 * for appointments (they are seed data, written nowhere in the backend yet),
 * so this thin reader serves the Atlas read tools, the productivity insights
 * aggregate, and GET /api/appointments: Mongo collection when connected,
 * bootstrap JSON file otherwise.
 *
 * Note this bypasses the repository registry, so it does not honour the
 * `databricks` backend — a pre-existing limitation, not introduced here.
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

/** Every appointment, unfiltered. Used by the productivity insights aggregate. */
export async function getAllAppointments(): Promise<MemberAppointment[]> {
  if (appConn) {
    const docs = await appConn
      .collection('memberAppointments')
      .find({}, { projection: { _id: 0 } })
      .toArray();
    return docs as unknown as MemberAppointment[];
  }
  const raw = await fs.readFile(
    path.join(BOOTSTRAP_PATHS.runtimeDir, 'memberAppointments.json'),
    'utf8',
  );
  return JSON.parse(raw) as MemberAppointment[];
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
