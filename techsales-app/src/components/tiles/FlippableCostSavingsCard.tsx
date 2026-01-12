import { useState } from 'react';
import { Target, RotateCcw, Calculator, TrendingDown } from 'lucide-react';
import type { CostSavingsBreakdown } from '../../utils/costSavingsUtils';

interface FlippableCostSavingsCardProps {
  totalSavings: number;
  breakdown: CostSavingsBreakdown;
  formatCurrency: (amount: number) => string;
}

export function FlippableCostSavingsCard({
  totalSavings,
  breakdown,
  formatCurrency,
}: FlippableCostSavingsCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="relative h-full min-h-[180px] cursor-pointer"
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Total Cost Savings
              </h3>
            </div>
            <Target className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totalSavings)}
                </span>
              </div>
              <p className="text-xs text-primary-600 dark:text-primary-400 mt-2">
                From multi-platform savings
              </p>
            </div>
          </div>
          
          {/* Click hint */}
          <div className="absolute bottom-3 right-3">
            <Calculator className="w-4 h-4 text-gray-400 dark:text-gray-500 animate-pulse" />
          </div>
        </div>

        {/* Back Side - Dark glass style */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-900 dark:to-black rounded-xl p-4 text-white overflow-hidden border border-primary-500/30"
          style={{ 
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Approx badge */}
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">
            <span>≈</span>
            <span>Approx</span>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-primary-400" />
            <p className="text-sm font-medium text-white/90">
              Savings Breakdown
            </p>
          </div>

          {/* Product breakdown */}
          <div className="space-y-1.5 text-xs">
            {breakdown.mapd.count > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-white">MAPD/MA ({breakdown.mapd.count} × ${breakdown.mapd.rate})</span>
                <span className="font-semibold text-primary-400">{formatCurrency(breakdown.mapd.savings)}</span>
              </div>
            )}
            {breakdown.pdp.count > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-white">PDP ({breakdown.pdp.count} × ${breakdown.pdp.rate})</span>
                <span className="font-semibold text-primary-400">{formatCurrency(breakdown.pdp.savings)}</span>
              </div>
            )}
            {breakdown.medsup.count > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-white">Medsup ({breakdown.medsup.count} × {breakdown.medsup.rate})</span>
                <span className="font-semibold text-primary-400">{formatCurrency(breakdown.medsup.savings)}</span>
              </div>
            )}
            {breakdown.anc.count > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-white">ANC ({breakdown.anc.count} × {breakdown.anc.rate})</span>
                <span className="font-semibold text-primary-400">{formatCurrency(breakdown.anc.savings)}</span>
              </div>
            )}
            
            {/* Show loading state if no breakdown data yet but total exists */}
            {breakdown.mapd.count === 0 && breakdown.pdp.count === 0 && 
             breakdown.medsup.count === 0 && breakdown.anc.count === 0 && totalSavings > 0 && (
              <div className="text-center text-white/60 py-2">
                Loading breakdown...
              </div>
            )}
            
            <div className="border-t border-white/20 pt-1.5 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">Total Savings</span>
                <span className="font-bold text-primary-400">{formatCurrency(totalSavings)}</span>
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
