import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus, RotateCcw, Calculator } from 'lucide-react';

interface FlippableStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  change?: number;
  changeLabel?: string;
  color: 'blue' | 'green' | 'purple' | 'orange' | 'emerald';
  /** Optional drill-down. Only the value links, so the card can still flip. */
  to?: string;
  // Back side content for flip
  backTitle: string;
  formula: string;
  calculation: {
    numerator: { label: string; value: number };
    denominator: { label: string; value: number };
    result: string;
  };
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

export function FlippableStatCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel,
  color,
  to,
  backTitle,
  formula,
  calculation,
}: FlippableStatCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
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

  return (
    <div 
      className="relative h-full min-h-[120px] cursor-pointer"
      onClick={() => setIsFlipped(!isFlipped)}
      style={{ perspective: '1000px' }}
    >
      <div
        className="relative w-full h-full transition-transform duration-500 ease-in-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(-180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front Side */}
        <div
          className="absolute inset-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md transition-all"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                {title}
              </p>
              {to ? (
                <Link
                  to={to}
                  onClick={(e) => e.stopPropagation()}
                  className="text-2xl font-bold text-gray-900 underline decoration-dotted underline-offset-4 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                >
                  {value}
                </Link>
              ) : (
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
              )}
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
          
          {/* Animated calculator icon as click hint */}
          <div className="absolute bottom-3 right-3">
            <Calculator className="w-4 h-4 text-gray-400 dark:text-gray-500 animate-pulse" />
          </div>
        </div>

        {/* Back Side - Dark glass style (matching Total Cost Savings) */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-900 dark:to-black rounded-xl p-4 text-white overflow-hidden border border-primary-500/30"
          style={{ 
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Formula badge */}
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-primary-400" />
            <p className="text-sm font-medium text-white/90">
              {backTitle}
            </p>
          </div>

          {/* Formula display */}
          <div className="bg-white/10 rounded-lg px-3 py-1.5 mb-3">
            <p className="text-xs font-mono text-primary-300">
              {formula}
            </p>
          </div>

          {/* Calculation breakdown */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-white">{calculation.numerator.label}</span>
              <span className="font-semibold text-primary-400">{calculation.numerator.value}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 border-t border-white/20" />
              <span className="text-white/50 text-xs">÷</span>
              <div className="flex-1 border-t border-white/20" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white">{calculation.denominator.label}</span>
              <span className="font-semibold text-primary-400">{calculation.denominator.value}</span>
            </div>
            
            <div className="border-t border-white/20 pt-1.5 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">Result</span>
                <span className="font-bold text-primary-400">{calculation.result}</span>
              </div>
            </div>
          </div>

          {/* Flip back hint */}
          <div className="absolute bottom-2 right-2">
            <RotateCcw className="w-4 h-4 text-white/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
