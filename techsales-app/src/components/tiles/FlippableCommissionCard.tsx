import { useState } from 'react';
import { RotateCcw, Calculator, DollarSign, Percent } from 'lucide-react';

interface FlippableCommissionCardProps {
  estimatedCommission: number;
  changePercent?: number;
  formatCurrency: (amount: number) => string;
}

export function FlippableCommissionCard({
  estimatedCommission,
  changePercent = 15,
  formatCurrency,
}: FlippableCommissionCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="relative h-full min-h-[200px] cursor-pointer"
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
        {/* Front Side - Purple gradient */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Commission Tracker</h3>
            <DollarSign className="w-6 h-6 text-purple-200" />
          </div>
          <div className="text-center py-2">
            <p className="text-purple-100 text-sm">Estimated This Month</p>
            <p className="text-4xl font-bold mt-1">{formatCurrency(estimatedCommission)}</p>
            {changePercent !== undefined && (
              <p className={`text-sm mt-1 ${changePercent >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {changePercent >= 0 ? '↑' : '↓'} {Math.abs(changePercent)}% vs last month
              </p>
            )}
          </div>
          
          {/* Click hint */}
          <div className="absolute bottom-3 right-3">
            <Calculator className="w-4 h-4 text-purple-200 animate-pulse" />
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
          <div className="flex items-center gap-2 mb-4">
            <Percent className="w-4 h-4 text-primary-400" />
            <p className="text-sm font-medium text-white/90">
              Commission Structure
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-white">MAPD / MA</span>
              <span className="text-primary-400 font-medium">15% of premium</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white">PDP</span>
              <span className="text-primary-400 font-medium">15% of premium</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white">Medsup</span>
              <span className="text-primary-400 font-medium">20% of premium</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white">ANC</span>
              <span className="text-primary-400 font-medium">20% of premium</span>
            </div>
            
            <div className="border-t border-white/20 pt-2 mt-3">
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">Your Estimate</span>
                <span className="font-bold text-primary-400">{formatCurrency(estimatedCommission)}</span>
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
