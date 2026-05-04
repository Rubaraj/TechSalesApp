import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Star,
  DollarSign,
  Pill,
  Heart,
  MapPin,
  ArrowRight,
  RefreshCw,
  CheckCircle,
  Info,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button, Badge, Select, Input, Modal, LeadAutocomplete } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { EmptyState } from '../../components/common/EmptyState';
import { useAiEnabled } from '../../hooks/useAiEnabled';
import { RecommendedPlansTab } from '../../components/recommendations/RecommendedPlansTab';
import type { Lead } from '../../types';

interface LeadForRecommendation {
  id: string;
  name: string;
  county: string;
  state: string;
  hasMedicaid: boolean;
  lisLevel?: number;
  pharmacies: string[];
  drugs: { name: string; dosage: string }[];
}

interface RecommendedPlan {
  planId: string;
  planName: string;
  carrier: string;
  planType: string;
  category: string;
  premium: number;
  adjustedPremium: number;
  starRating: number;
  drugCoverage: number; // percentage of drugs covered
  pharmacyCoverage: number; // percentage of pharmacies in network
  estimatedAnnualCost: number;
  highlights: string[];
  matchScore: number; // 0-100
}

// Mock data
const mockLeads: LeadForRecommendation[] = [
  {
    id: 'LEAD-001',
    name: 'John Smith',
    county: 'Miami-Dade',
    state: 'FL',
    hasMedicaid: true,
    lisLevel: 1,
    pharmacies: ['CVS Pharmacy', 'Walgreens'],
    drugs: [
      { name: 'Metformin', dosage: '500mg' },
      { name: 'Lisinopril', dosage: '10mg' },
      { name: 'Atorvastatin', dosage: '20mg' },
    ],
  },
  {
    id: 'LEAD-002',
    name: 'Mary Johnson',
    county: 'Harris',
    state: 'TX',
    hasMedicaid: false,
    pharmacies: ['Walmart Pharmacy'],
    drugs: [
      { name: 'Omeprazole', dosage: '20mg' },
    ],
  },
];

const mockRecommendations: RecommendedPlan[] = [
  {
    planId: 'PLAN-001',
    planName: 'Carrier 5 MAPD Gold',
    carrier: 'Carrier 5',
    planType: 'MAPD',
    category: 'HMO',
    premium: 0,
    adjustedPremium: 0,
    starRating: 4.5,
    drugCoverage: 100,
    pharmacyCoverage: 100,
    estimatedAnnualCost: 850,
    highlights: ['$0 Premium', 'All drugs covered', 'Both pharmacies in network'],
    matchScore: 98,
  },
  {
    planId: 'PLAN-002',
    planName: 'Carrier 1 DSNP Complete',
    carrier: 'Carrier 1',
    planType: 'DSNP',
    category: 'HMO',
    premium: 0,
    adjustedPremium: 0,
    starRating: 4.0,
    drugCoverage: 100,
    pharmacyCoverage: 50,
    estimatedAnnualCost: 920,
    highlights: ['$0 Premium', 'DSNP Benefits', 'Extra dental coverage'],
    matchScore: 92,
  },
  {
    planId: 'PLAN-003',
    planName: 'Carrier 2 Gold Plus',
    carrier: 'Carrier 2',
    planType: 'MAPD',
    category: 'PPO',
    premium: 25,
    adjustedPremium: 0,
    starRating: 4.5,
    drugCoverage: 67,
    pharmacyCoverage: 100,
    estimatedAnnualCost: 1150,
    highlights: ['PPO Flexibility', 'Strong pharmacy network', 'OTC allowance'],
    matchScore: 85,
  },
];

function PlanRecommendationsAI() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState('');

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            Plan Recommendations
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            AI-powered plan suggestions tailored to a beneficiary's profile.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Select Beneficiary
        </h2>
        <LeadAutocomplete
          value={selectedLeadId}
          onChange={(leadId, lead) => {
            setSelectedLeadId(leadId);
            setSelectedLead(lead);
          }}
          placeholder="Type to search by name, email, phone, or lead id..."
        />
      </div>

      {selectedLead ? (
        <RecommendedPlansTab leadId={selectedLead.leadId} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Sparkles className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Select a Beneficiary
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Choose a beneficiary above to see personalized plan recommendations.
          </p>
        </div>
      )}
    </div>
  );
}

function PlanRecommendationsLegacy() {
  const navigate = useNavigate();
  const [selectedLead, setSelectedLead] = useState<LeadForRecommendation | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendedPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    planType: '',
    maxPremium: '',
    minStars: '',
  });

  const handleLeadSelect = (leadId: string) => {
    const lead = mockLeads.find(l => l.id === leadId);
    setSelectedLead(lead || null);
    if (lead) {
      generateRecommendations(lead);
    }
  };

  const generateRecommendations = (lead: LeadForRecommendation) => {
    setIsLoading(true);
    setTimeout(() => {
      // Apply filters
      let filtered = [...mockRecommendations];
      if (filters.planType) {
        filtered = filtered.filter(p => p.planType === filters.planType);
      }
      if (filters.maxPremium) {
        filtered = filtered.filter(p => p.adjustedPremium <= Number(filters.maxPremium));
      }
      if (filters.minStars) {
        filtered = filtered.filter(p => p.starRating >= Number(filters.minStars));
      }
      setRecommendations(filtered);
      setIsLoading(false);
    }, 800);
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
    if (score >= 75) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
    if (score >= 60) return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
    return 'text-red-600 bg-red-100 dark:bg-red-900/30';
  };

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < fullStars
                ? 'text-yellow-400 fill-yellow-400'
                : i === fullStars && hasHalf
                ? 'text-yellow-400 fill-yellow-400/50'
                : 'text-gray-300 dark:text-gray-600'
            }`}
          />
        ))}
        <span className="ml-1 text-sm font-medium text-gray-600 dark:text-gray-400">{rating}</span>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-orange-600" />
            Plan Recommendations
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Plan suggestions based on beneficiary needs
          </p>
        </div>
      </div>

      {/* Lead Selection */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Select Beneficiary</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockLeads.map((lead) => (
            <div
              key={lead.id}
              onClick={() => handleLeadSelect(lead.id)}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedLead?.id === lead.id
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-orange-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">{lead.name}</h3>
                {selectedLead?.id === lead.id && (
                  <CheckCircle className="w-5 h-5 text-orange-600" />
                )}
              </div>
              <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <p className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {lead.county}, {lead.state}
                </p>
                <p className="flex items-center gap-1">
                  <Pill className="w-3 h-3" />
                  {lead.drugs.length} medications
                </p>
                {lead.hasMedicaid && (
                  <Badge variant="success" className="mt-1">Medicaid Eligible</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Lead Details & Filters */}
      {selectedLead && (
        <div className="bg-gradient-to-r from-orange-50 to-blue-50 dark:from-orange-900/20 dark:to-blue-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-800">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Recommending for: {selectedLead.name}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Location</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedLead.county}, {selectedLead.state}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Medicaid</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedLead.hasMedicaid ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">LIS Level</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedLead.lisLevel || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Medications</p>
                  <p className="font-medium text-gray-900 dark:text-white">{selectedLead.drugs.length}</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
                Filters
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
              <Button onClick={() => generateRecommendations(selectedLead)}>
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-orange-200 dark:border-orange-700 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="Plan Type"
                options={[
                  { value: '', label: 'All Types' },
                  { value: 'MAPD', label: 'MAPD' },
                  { value: 'DSNP', label: 'DSNP' },
                  { value: 'PDP', label: 'PDP' },
                ]}
                value={filters.planType}
                onChange={(e) => setFilters({ ...filters, planType: e.target.value })}
              />
              <Input
                label="Max Premium"
                type="number"
                placeholder="Any"
                value={filters.maxPremium}
                onChange={(e) => setFilters({ ...filters, maxPremium: e.target.value })}
              />
              <Select
                label="Minimum Stars"
                options={[
                  { value: '', label: 'Any' },
                  { value: '3', label: '3+ Stars' },
                  { value: '4', label: '4+ Stars' },
                  { value: '4.5', label: '4.5+ Stars' },
                ]}
                value={filters.minStars}
                onChange={(e) => setFilters({ ...filters, minStars: e.target.value })}
              />
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Analyzing plans...</p>
          </div>
        </div>
      ) : recommendations.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Top Recommended Plans
          </h2>
          
          {recommendations.map((plan, index) => (
            <div
              key={plan.planId}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {/* Rank Badge */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30' :
                      index === 1 ? 'bg-gray-100 text-gray-700 dark:bg-gray-700' :
                      'bg-orange-100 text-orange-700 dark:bg-orange-900/30'
                    }`}>
                      #{index + 1}
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {plan.planName}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400">{plan.carrier}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <Badge variant="primary">{plan.planType}</Badge>
                        <Badge variant="default">{plan.category}</Badge>
                        {renderStars(plan.starRating)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-bold ${getScoreColor(plan.matchScore)}`}>
                      <Sparkles className="w-4 h-4" />
                      {plan.matchScore}% Match
                    </div>
                    <div className="mt-2">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        ${plan.adjustedPremium}<span className="text-sm font-normal text-gray-500">/mo</span>
                      </p>
                      {plan.premium !== plan.adjustedPremium && (
                        <p className="text-sm text-gray-500 line-through">${plan.premium}/mo</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-green-600">
                      <Pill className="w-4 h-4" />
                      <span className="font-bold">{plan.drugCoverage}%</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Drugs Covered</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-600">
                      <MapPin className="w-4 h-4" />
                      <span className="font-bold">{plan.pharmacyCoverage}%</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pharmacies In-Network</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-purple-600">
                      <DollarSign className="w-4 h-4" />
                      <span className="font-bold">${plan.estimatedAnnualCost}</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Est. Annual Cost</p>
                  </div>
                </div>

                {/* Highlights */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {plan.highlights.map((highlight, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded-full">
                      <CheckCircle className="w-3 h-3" />
                      {highlight}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <Button variant="outline" onClick={() => navigate(`/plans/${plan.planId}`)}>
                    View Details
                  </Button>
                  <Button>
                    Select Plan
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : selectedLead ? (
        <EmptyState
          icon={Sparkles}
          title="No matching plans"
          description="Try adjusting your filters to see more recommendations"
          action={<Button onClick={() => setFilters({ planType: '', maxPremium: '', minStars: '' })}>Clear Filters</Button>}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Sparkles className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select a Beneficiary</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Choose a beneficiary above to see personalized plan recommendations
          </p>
        </div>
      )}
    </div>
  );
}

export function PlanRecommendations() {
  const aiEnabled = useAiEnabled();
  if (aiEnabled) return <PlanRecommendationsAI />;
  return <PlanRecommendationsLegacy />;
}

