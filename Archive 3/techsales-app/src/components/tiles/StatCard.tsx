import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  changeLabel?: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'emerald';
  to?: string; // Optional navigation link
}

const colorVariants = {
  blue: {
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  green: {
    iconBg: 'bg-green-100 dark:bg-green-900/50',
    icon: 'text-green-600 dark:text-green-400',
  },
  purple: {
    iconBg: 'bg-purple-100 dark:bg-purple-900/50',
    icon: 'text-purple-600 dark:text-purple-400',
  },
  orange: {
    iconBg: 'bg-primary-100 dark:bg-primary-900/50',
    icon: 'text-primary-600 dark:text-primary-400',
  },
  emerald: {
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel,
  color,
  to,
}: StatCardProps) {
  const colors = colorVariants[color];

  const getTrendIcon = () => {
    if (change === undefined || change === 0) {
      return <Minus className="w-4 h-4 text-gray-400" />;
    }
    if (change > 0) {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    }
    return <TrendingDown className="w-4 h-4 text-red-500" />;
  };

  const getTrendColor = () => {
    if (change === undefined || change === 0) return 'text-gray-500';
    if (change > 0) return 'text-green-600 dark:text-green-400';
    return 'text-red-600 dark:text-red-400';
  };

  const content = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-black-500 dark:text-gray-400 mb-1">
            {title}
          </p>
          <p className={`text-2xl font-bold text-gray-900 dark:text-white ${to ? 'hover:text-primary-600 dark:hover:text-primary-400 underline decoration-dotted underline-offset-4' : ''}`}>
            {value}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colors.icon}`} />
        </div>
      </div>

      {change !== undefined && (
        <div className="flex items-center gap-1 mt-3">
          {getTrendIcon()}
          <span className={`text-sm font-medium ${getTrendColor()}`}>
            {change > 0 ? '+' : ''}{change}%
          </span>
          {changeLabel && (
            <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </>
  );

  if (to) {
    return (
      <Link 
        to={to} 
        className="block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md transition-all cursor-pointer"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      {content}
    </div>
  );
}

