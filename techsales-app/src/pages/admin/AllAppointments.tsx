import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { Button, Input, Select, Badge, Pagination, ActiveFilterChips } from '../../components/common';
import { EmptyState } from '../../components/common/EmptyState';
import { getAppointments } from '../../services/appointmentService';
import type { MemberAppointment } from '../../types';
import { formatDate } from '../../utils/dateUtils';

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'Scheduled', label: 'Scheduled' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Rescheduled', label: 'Rescheduled' },
];

const statusVariant = (status: string): 'success' | 'warning' | 'danger' | 'default' => {
  switch (status) {
    case 'Completed':
      return 'success';
    case 'Scheduled':
      return 'warning';
    case 'Cancelled':
      return 'danger';
    default:
      return 'default';
  }
};

/**
 * Team-wide appointment list. Exists so the "New Appointments" target card on
 * the productivity dashboard has somewhere to drill into — the period window
 * arrives as ?from/&to and is applied server-side by /api/appointments.
 */
export function AllAppointments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const periodFrom = searchParams.get('from');
  const periodTo = searchParams.get('to');
  const agentId = searchParams.get('agentId') ?? undefined;

  const [appointments, setAppointments] = useState<MemberAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      const res = await getAppointments({ agentId, from: periodFrom, to: periodTo });
      if (cancelled) return;
      if (res.success && res.data) {
        setAppointments(res.data);
      } else {
        setAppointments([]);
        setError(res.error ?? 'Could not load appointments.');
      }
      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [agentId, periodFrom, periodTo]);

  const filtered = useMemo(() => {
    let rows = appointments;
    if (statusFilter !== 'all') rows = rows.filter((a) => a.status === statusFilter);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      rows = rows.filter((a) =>
        [a.appointmentId, a.memberId, a.agentName, a.appointmentType, a.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [appointments, statusFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pagination.pageSize));
  const page = Math.min(pagination.page, totalPages);
  const pageRows = filtered.slice((page - 1) * pagination.pageSize, page * pagination.pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => navigate(-1)} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appointments</h1>
          <p className="text-gray-500 dark:text-gray-400">
            {filtered.length} appointment{filtered.length === 1 ? '' : 's'} across the team
          </p>
        </div>
      </div>

      <ActiveFilterChips />

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[220px]">
          <Input
            placeholder="Search by member, agent, type or notes..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          />
        </div>
        <div className="w-48">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading appointments…</p>
      ) : pageRows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No appointments"
          description="No appointments match the current filters."
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/40">
                <tr className="text-left text-sm text-gray-600 dark:text-gray-400">
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Time</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Agent</th>
                  <th className="py-3 px-4 font-medium">Subject</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => (
                  <tr
                    key={a.appointmentId}
                    className="border-t border-gray-100 dark:border-gray-700 text-sm"
                  >
                    <td className="py-3 px-4 text-gray-900 dark:text-white">{formatDate(a.scheduledDate)}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{a.scheduledTime}</td>
                    <td className="py-3 px-4 text-gray-900 dark:text-white">{a.appointmentType}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{a.agentName}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{a.memberId}</td>
                    <td className="py-3 px-4">
                      <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            pageSize={pagination.pageSize}
            totalItems={filtered.length}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(size) => setPagination({ page: 1, pageSize: size })}
          />
        </div>
      )}
    </div>
  );
}
