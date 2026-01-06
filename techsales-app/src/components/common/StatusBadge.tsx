import type { LeadStatus } from '../../types';

interface StatusBadgeProps {
  status: LeadStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<LeadStatus, { label: string; color: string; bgColor: string }> = {
  'New Lead': {
    label: 'New Lead',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  'Contacted Lead': {
    label: 'Contacted Lead',
    color: 'text-purple-700 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  'Appointment Schedule': {
    label: 'Appointment Schedule',
    color: 'text-cyan-700 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
  },
  'Enrollment in progress': {
    label: 'Enrollment in progress',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  'Enrolled': {
    label: 'Enrolled',
    color: 'text-green-700 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  'Dropped / Lost lead': {
    label: 'Dropped / Lost lead',
    color: 'text-red-700 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig['New Lead'];
  
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full
        ${config.color} ${config.bgColor}
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${config.color.replace('text-', 'bg-').replace('dark:text-', 'dark:bg-')}`} />
      {config.label}
    </span>
  );
}
