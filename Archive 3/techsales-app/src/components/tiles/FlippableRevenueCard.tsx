import { useState } from 'react';
import { Target, RotateCcw, Calculator, ChevronLeft, ChevronRight, DollarSign, Percent } from 'lucide-react';

interface FlippableRevenueCardProps {
  totalRevenue: number;
  agentRevenue: number;
  carrierRevenue: number;
  formatCurrency: (amount: number) => string;
}

export function FlippableRevenueCard({
  totalRevenue,
  agentRevenue,
  carrierRevenue,
  formatCurrency,
}: FlippableRevenueCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [backSlide, setBackSlide] = useState(0); // 0 = Commission structure, 1 = Revenue breakdown

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't flip if clicking navigation arrows
    if ((e.target as HTMLElement).closest('.nav-arrow')) {
      return;
    }
    setIsFlipped(!isFlipped);
    if (!isFlipped) {
      setBackSlide(0); // Reset to first slide when flipping to back
    }
  };

  const handlePrevSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBackSlide(0);
  };

  const handleNextSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBackSlide(1);
  };

  return (
    <div 
      className="relative h-full min-h-[180px] cursor-pointer"
      onClick={handleCardClick}
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
                Total Revenue
              </h3>
            </div>
            <Target className="w-8 h-8 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totalRevenue)}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <p className="text-xs text-primary-600 dark:text-primary-400">
                  Agent: {formatCurrency(agentRevenue)}
                </p>
                <p className="text-xs text-primary-600 dark:text-primary-400">
                  Carrier: {formatCurrency(carrierRevenue)}
                </p>
              </div>
            </div>
          </div>
          
          {/* Click hint */}
          <div className="absolute bottom-3 right-3">
            <Calculator className="w-4 h-4 text-gray-400 dark:text-gray-500 animate-pulse" />
          </div>
        </div>

        {/* Back Side - Dark glass style with slides */}
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

          {/* Slide indicator dots */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1">
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${backSlide === 0 ? 'bg-primary-400' : 'bg-white/30'}`} />
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${backSlide === 1 ? 'bg-primary-400' : 'bg-white/30'}`} />
          </div>

          {/* Slide Content */}
          <div className="mt-4 relative h-[calc(100%-2rem)]">
            {/* Slide 0: Commission Structure */}
            <div 
              className={`absolute inset-0 transition-all duration-300 ${
                backSlide === 0 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <Percent className="w-4 h-4 text-primary-400" />
                <p className="text-sm font-medium text-white/90">
                  Commission Structure
                </p>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-white">MAPD / MA</span>
                  <span className="text-primary-400">Agent 15% • Carrier 75%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white">PDP</span>
                  <span className="text-primary-400">Agent 15% • Carrier 75%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white">Medsup</span>
                  <span className="text-primary-400">Agent 20% • Carrier 80%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white">ANC</span>
                  <span className="text-primary-400">Agent 20% • Carrier 80%</span>
                </div>
              </div>
            </div>

            {/* Slide 1: Revenue Breakdown */}
            <div 
              className={`absolute inset-0 transition-all duration-300 ${
                backSlide === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-primary-400" />
                <p className="text-sm font-medium text-white/90">
                  Revenue Breakdown
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-white">Agent Revenue</span>
                  <span className="font-semibold text-primary-400">{formatCurrency(agentRevenue)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 border-t border-white/20" />
                  <span className="text-white/40">+</span>
                  <div className="flex-1 border-t border-white/20" />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white">Carrier Revenue</span>
                  <span className="font-semibold text-primary-400">{formatCurrency(carrierRevenue)}</span>
                </div>
                <div className="border-t-2 border-white/30 pt-2 mt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium">Total Revenue</span>
                    <span className="font-bold text-primary-400 text-sm">{formatCurrency(totalRevenue)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation arrows */}
          {backSlide === 0 ? (
            <button
              onClick={handleNextSlide}
              className="nav-arrow absolute right-2 bottom-2 w-6 h-6 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handlePrevSlide}
              className="nav-arrow absolute left-2 bottom-2 w-6 h-6 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          {/* Flip back hint */}
          <div className="absolute bottom-2 right-2">
            <RotateCcw className={`w-4 h-4 text-white/40 ${backSlide === 1 ? '' : 'hidden'}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
