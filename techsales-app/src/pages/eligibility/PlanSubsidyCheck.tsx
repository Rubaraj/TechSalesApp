import { useState, useEffect } from 'react';
import { 
  Search,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  FileCheck,
  HelpCircle,
  Pill
} from 'lucide-react';
import { Button, Input, Badge, Modal, Select, DatePicker } from '../../components/common';
import { EmptyState } from '../../components/common/EmptyState';
import type { PlanSubsidyEligibility } from '../../types';

// Mock eligibility records
const mockRecords: PlanSubsidyEligibility[] = [
  {
    id: 'PS-001',
    leadId: 'LEAD-001',
    leadName: 'John Smith',
    medicareNumber: 'MBI-1234567890',
    subsidyLevel: 1,
    isEligible: true,
    copayLevel: '$0.00',
    verificationDate: '2025-01-10',
    effectiveDate: '2025-01-01',
    createdAt: '2025-01-10T10:00:00Z',
  },
  {
    id: 'PS-002',
    leadId: 'LEAD-002',
    leadName: 'Mary Johnson',
    medicareNumber: 'MBI-2345678901',
    subsidyLevel: 3,
    isEligible: true,
    copayLevel: '$4.30 generic / $10.35 brand',
    verificationDate: '2025-01-12',
    effectiveDate: '2025-01-01',
    createdAt: '2025-01-12T14:00:00Z',
  },
  {
    id: 'PS-003',
    leadId: 'LEAD-003',
    leadName: 'Robert Williams',
    medicareNumber: 'MBI-3456789012',
    subsidyLevel: undefined,
    isEligible: false,
    verificationDate: '2025-01-14',
    createdAt: '2025-01-14T09:00:00Z',
  },
];

const subsidyLevels = [
  { level: 1, name: 'Full Subsidy', copay: '$0.00 for all drugs', description: 'Full dual eligible (State Assistance + Medicare)' },
  { level: 2, name: 'Full Subsidy', copay: '$0.00 for all drugs', description: 'Full subsidy with income ≤100% FPL' },
  { level: 3, name: 'Full Subsidy', copay: '$4.30 generic / $10.35 brand (2025)', description: 'Full subsidy with income >100% and ≤135% FPL' },
  { level: 4, name: 'Partial Subsidy', copay: '15% coinsurance', description: 'Income >135% and ≤150% FPL' },
];

export function PlanSubsidyCheckPage() {
  const [records, setRecords] = useState<PlanSubsidyEligibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PlanSubsidyEligibility | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Check form state
  const [checkForm, setCheckForm] = useState({
    leadName: '',
    medicareNumber: '',
    dateOfBirth: '',
  });
  const [checkResult, setCheckResult] = useState<{
    checked: boolean;
    isEligible: boolean;
    level?: number;
    copay?: string;
  } | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setTimeout(() => {
      setRecords(mockRecords);
      setIsLoading(false);
    }, 300);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getLevelInfo = (level: number) => {
    return subsidyLevels.find(l => l.level === level);
  };

  const handleCheck = () => {
    setTimeout(() => {
      const isEligible = Math.random() > 0.3;
      const level = isEligible ? Math.floor(Math.random() * 4) + 1 : undefined;
      const levelInfo = level ? getLevelInfo(level) : undefined;
      setCheckResult({
        checked: true,
        isEligible,
        level,
        copay: levelInfo?.copay,
      });
    }, 1000);
  };

  // Stats
  const stats = {
    total: records.length,
    eligible: records.filter(r => r.isEligible).length,
    fullSubsidy: records.filter(r => r.subsidyLevel && r.subsidyLevel <= 3).length,
    partialSubsidy: records.filter(r => r.subsidyLevel === 4).length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plan Subsidy Check</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Verify beneficiary eligibility for Extra Help with prescription drug costs
          </p>
        </div>
        <Button onClick={() => {
          setCheckResult(null);
          setCheckForm({ leadName: '', medicareNumber: '', dateOfBirth: '' });
          setIsCheckModalOpen(true);
        }}>
          <Search className="w-4 h-4" />
          Check Eligibility
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Checked</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-green-600">Eligible</p>
          <p className="text-2xl font-bold text-green-600">{stats.eligible}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-blue-600">Full Subsidy</p>
          <p className="text-2xl font-bold text-blue-600">{stats.fullSubsidy}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-amber-600">Partial Subsidy</p>
          <p className="text-2xl font-bold text-amber-600">{stats.partialSubsidy}</p>
        </div>
      </div>

      {/* Subsidy Levels Info */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
        <div className="flex items-start gap-3">
          <Pill className="w-5 h-5 text-purple-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-purple-900 dark:text-purple-100">Subsidy Levels</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {subsidyLevels.map((level) => (
                <div key={level.level} className="bg-white/60 dark:bg-gray-800/40 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={level.level <= 3 ? 'primary' : 'warning'}>Level {level.level}</Badge>
                    <span className="font-medium text-purple-900 dark:text-purple-100">{level.name}</span>
                  </div>
                  <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">{level.copay}</p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">{level.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Records List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon={FileCheck}
          title="No subsidy records"
          description="Check beneficiary plan subsidy eligibility to get started"
          action={<Button onClick={() => setIsCheckModalOpen(true)}><Search className="w-4 h-4" />Check Eligibility</Button>}
        />
      ) : (
        <div className="space-y-3">
          {records.map((record) => {
            const levelInfo = record.subsidyLevel ? getLevelInfo(record.subsidyLevel) : undefined;
            
            return (
              <div
                key={record.id}
                onClick={() => {
                  setSelectedRecord(record);
                  setIsDetailOpen(true);
                }}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${record.isEligible ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                      {record.isEligible ? (
                        <DollarSign className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{record.leadName}</h3>
                        {record.subsidyLevel && (
                          <Badge variant={record.subsidyLevel <= 3 ? 'primary' : 'warning'}>
                            Level {record.subsidyLevel}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <span>MBI: {record.medicareNumber}</span>
                        {record.copayLevel && (
                          <span className="text-green-600">Copay: {record.copayLevel}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <p className="text-gray-500 dark:text-gray-400">Verified: {formatDate(record.verificationDate)}</p>
                    </div>
                    <Badge variant={record.isEligible ? 'success' : 'danger'}>
                      {record.isEligible ? 'Eligible' : 'Not Eligible'}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Check Eligibility Modal */}
      <Modal
        isOpen={isCheckModalOpen}
        onClose={() => setIsCheckModalOpen(false)}
        title="Check Plan Subsidy Eligibility"
        size="md"
        footer={
          checkResult?.checked ? (
            <Button onClick={() => setIsCheckModalOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsCheckModalOpen(false)}>Cancel</Button>
              <Button onClick={handleCheck}>Check Eligibility</Button>
            </>
          )
        }
      >
        {checkResult?.checked ? (
          <div className="text-center py-6">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${checkResult.isEligible ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              {checkResult.isEligible ? (
                <DollarSign className="w-8 h-8 text-green-600" />
              ) : (
                <XCircle className="w-8 h-8 text-red-600" />
              )}
            </div>
            <h3 className={`text-xl font-bold mt-4 ${checkResult.isEligible ? 'text-green-600' : 'text-red-600'}`}>
              {checkResult.isEligible ? 'Eligible for Extra Help' : 'Not Eligible'}
            </h3>
            {checkResult.level && (
              <div className="mt-3">
                <Badge variant={checkResult.level <= 3 ? 'primary' : 'warning'}>
                  Level {checkResult.level} - {checkResult.level <= 3 ? 'Full Subsidy' : 'Partial Subsidy'}
                </Badge>
              </div>
            )}
            {checkResult.copay && (
              <p className="text-gray-600 dark:text-gray-400 mt-3">
                Drug Copay: <span className="font-medium text-green-600">{checkResult.copay}</span>
              </p>
            )}
            {checkResult.isEligible && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                This beneficiary qualifies for reduced prescription drug costs.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="Beneficiary Name"
              value={checkForm.leadName}
              onChange={(e) => setCheckForm({ ...checkForm, leadName: e.target.value })}
              placeholder="Enter full name"
            />
            <Input
              label="Medicare Number (MBI)"
              value={checkForm.medicareNumber}
              onChange={(e) => setCheckForm({ ...checkForm, medicareNumber: e.target.value })}
              placeholder="1EG4-TE5-MK72"
            />
            <DatePicker
              label="Date of Birth"
              value={checkForm.dateOfBirth}
              onChange={(date) => setCheckForm({ ...checkForm, dateOfBirth: date })}
              maxDate={new Date().toISOString().split('T')[0]}
            />
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Subsidy Details"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
            <Button variant="outline"><Search className="w-4 h-4" />Re-verify</Button>
          </>
        }
      >
        {selectedRecord && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className={`p-3 rounded-lg ${selectedRecord.isEligible ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                {selectedRecord.isEligible ? (
                  <DollarSign className="w-6 h-6 text-green-600" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{selectedRecord.leadName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {selectedRecord.subsidyLevel && (
                    <Badge variant={selectedRecord.subsidyLevel <= 3 ? 'primary' : 'warning'}>
                      Level {selectedRecord.subsidyLevel}
                    </Badge>
                  )}
                  <Badge variant={selectedRecord.isEligible ? 'success' : 'danger'}>
                    {selectedRecord.isEligible ? 'Eligible' : 'Not Eligible'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Medicare Number</p>
                <p className="font-medium text-gray-900 dark:text-white">{selectedRecord.medicareNumber}</p>
              </div>
              {selectedRecord.copayLevel && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Copay Level</p>
                  <p className="font-medium text-green-600">{selectedRecord.copayLevel}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Verification Date</p>
                <p className="font-medium text-gray-900 dark:text-white">{formatDate(selectedRecord.verificationDate)}</p>
              </div>
              {selectedRecord.effectiveDate && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Effective Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatDate(selectedRecord.effectiveDate)}</p>
                </div>
              )}
            </div>

            {selectedRecord.isEligible && selectedRecord.subsidyLevel && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-400">
                  ✓ Qualifies for {getLevelInfo(selectedRecord.subsidyLevel)?.name} - reduced prescription drug costs
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

