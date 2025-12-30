import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface NavigationTileProps {
  title: string;
  description: string;
  icon: LucideIcon;
  to: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'teal' | 'pink' | 'indigo';
  count?: number;
  badge?: string;
}

const colorVariants = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    iconBg: 'bg-blue-100 dark:bg-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    border: 'hover:border-blue-300 dark:hover:border-blue-700',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    iconBg: 'bg-green-100 dark:bg-green-800',
    icon: 'text-green-600 dark:text-green-400',
    border: 'hover:border-green-300 dark:hover:border-green-700',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    iconBg: 'bg-purple-100 dark:bg-purple-800',
    icon: 'text-purple-600 dark:text-purple-400',
    border: 'hover:border-purple-300 dark:hover:border-purple-700',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    iconBg: 'bg-orange-100 dark:bg-orange-800',
    icon: 'text-orange-600 dark:text-orange-400',
    border: 'hover:border-orange-300 dark:hover:border-orange-700',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    iconBg: 'bg-red-100 dark:bg-red-800',
    icon: 'text-red-600 dark:text-red-400',
    border: 'hover:border-red-300 dark:hover:border-red-700',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    iconBg: 'bg-teal-100 dark:bg-teal-800',
    icon: 'text-teal-600 dark:text-teal-400',
    border: 'hover:border-teal-300 dark:hover:border-teal-700',
  },
  pink: {
    bg: 'bg-pink-50 dark:bg-pink-900/20',
    iconBg: 'bg-pink-100 dark:bg-pink-800',
    icon: 'text-pink-600 dark:text-pink-400',
    border: 'hover:border-pink-300 dark:hover:border-pink-700',
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    iconBg: 'bg-indigo-100 dark:bg-indigo-800',
    icon: 'text-indigo-600 dark:text-indigo-400',
    border: 'hover:border-indigo-300 dark:hover:border-indigo-700',
  },
};

export function NavigationTile({
  title,
  description,
  icon: Icon,
  to,
  color,
  count,
  badge,
}: NavigationTileProps) {
  const colors = colorVariants[color];

  return (
    <Link
      to={to}
      className={`
        relative block p-6 rounded-xl border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800
        hover:shadow-lg transition-all duration-200 group
        ${colors.border}
      `}
    >
      {/* Badge */}
      {badge && (
        <span className="absolute top-3 right-3 px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
          {badge}
        </span>
      )}

      {/* Icon */}
      <div className={`w-12 h-12 rounded-lg ${colors.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className={`w-6 h-6 ${colors.icon}`} />
      </div>

      {/* Content */}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
        {title}
        {count !== undefined && (
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            ({count})
          </span>
        )}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>

      {/* Hover indicator */}
      <div className={`absolute bottom-0 left-0 right-0 h-1 ${colors.bg} rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity`} />
    </Link>
  );
}

