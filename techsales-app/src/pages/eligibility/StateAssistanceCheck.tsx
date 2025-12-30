import { useState, useEffect } from 'react';
import { 
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Calendar,
  FileCheck,
  HelpCircle
} from 'lucide-react';
import { Button, Input, Badge, Modal } from '../../components/common';
import { EmptyState } from '../../components/common/EmptyState';
import type { StateAssistanceEligibility } from '../../types';

// Mock eligibility records
const mockRecords: StateAssistanceEligibility[] = [
  {
    id: 'SA-001',
    leadId: 'LEAD-001',
    leadName: 'John Smith',
    stateAssistanceNumber: 'SA-12345678',
    state: 'FL',
    isEligible: true,
    eligibilityType: 'Full',
    verificationDate: '2025-01-10',
    expirationDate: '2025-12-31',
    createdAt: '2025-01-10T10:00:00Z',
  },
  {
    id: 'SA-002',
    leadId: 'LEAD-002',
    leadName: 'Mary Johnson',
    stateAssistanceNumber: 'SA-23456789',
    state: 'TX',
    isEligible: true,
    eligibilityType: 'QMB',
    verificationDate: '2025-01-12',
    expirationDate: '2025-06-30',
    createdAt: '2025-01-12T14:00:00Z',
  },
  {
    id: 'SA-003',
    leadId: 'LEAD-003',
    leadName: 'Robert Williams',
    stateAssistanceNumber: 'SA-34567890',
    state: 'CA',
    isEligible: false,
    eligibilityType: undefined,
    verificationDate: '2025-01-14',
    createdAt: '2025-01-14T09:00:00Z',
  },
];

const eligibilityTypes = [
  { value: 'Full', label: 'Full State Assistance', description: 'Eligible for DSNP and full benefits' },
  { value: 'QMB', label: 'QMB (Qualified Medicare Beneficiary)', description: 'Medicare premiums and cost-sharing' },
  { value: 'SLMB', label: 'SLMB (Specified Low-Income Medicare Beneficiary)', description: 'Medicare Part B premium assistance' },
  { value: 'QI', label: 'QI (Qualifying Individual)', description: 'Part B premium assistance only' },
];

export function StateAssistanceCheckPage() {
  const [records, setRecords] = useState<StateAssistanceEligibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<StateAssistanceEligibility | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Check form state
  const [checkForm, setCheckForm] = useState({
    leadName: '',
    stateAssistanceNumber: '',
    state: '',
    dateOfBirth: '',
  });
  const [checkResult, setCheckResult] = useState<{
    checked: boolean;
    isEligible: boolean;
    type?: string;
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

  const handleCheck = () => {
    // Simulate eligibility check
    setTimeout(() => {
      const isEligible = Math.random() > 0.3;
      setCheckResult({
        checked: true,
        isEligible,
        type: isEligible ? eligibilityTypes[Math.floor(Math.random() * eligibilityTypes.length)].value : undefined,
      });
    }, 1000);
  };

  // Stats
  const stats = {
    total: records.length,
    eligible: records.filter(r => r.isEligible).length,
    ineligible: records.filter(r => !r.isEligible).length,
    expiringSoon: records.filter(r => {
      if (!r.expirationDate) return false;
      const exp = new Date(r.expirationDate);
      const now = new Date();
      const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 30 && diff > 0;
    }).length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">State Assistance Check</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Verify beneficiary state assistance eligibility for DSNP plans
          </p>
        </div>
        <Button onClick={() => {
          setCheckResult(null);
          setCheckForm({ leadName: '', stateAssistanceNumber: '', state: '', dateOfBirth: '' });
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
          <p className="text-sm text-red-600">Not Eligible</p>
          <p className="text-2xl font-bold text-red-600">{stats.ineligible}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-amber-600">Expiring Soon</p>
          <p className="text-2xl font-bold text-amber-600">{stats.expiringSoon}</p>
        </div>
      </div>

      {/* Eligibility Types Info */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-100">State Assistance Eligibility Types</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {eligibilityTypes.map((type) => (
                <div key={type.value} className="text-sm">
                  <span className="font-medium text-blue-800 dark:text-blue-200">{type.label}:</span>
                  <span className="text-blue-700 dark:text-blue-300 ml-1">{type.description}</span>
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
          title="No eligibility records"
          description="Check beneficiary state assistance eligibility to get started"
          action={<Button onClick={() => setIsCheckModalOpen(true)}><Search className="w-4 h-4" />Check Eligibility</Button>}
        />
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
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
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{record.leadName}</h3>
                      {record.eligibilityType && (
                        <Badge variant="primary">{record.eligibilityType}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                      <span>State Assistance #: {record.stateAssistanceNumber}</span>
                      <span>State: {record.state}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right text-sm">
                    <p className="text-gray-500 dark:text-gray-400">Verified: {formatDate(record.verificationDate)}</p>
                    {record.expirationDate && (
                      <p className={`${new Date(record.expirationDate) < new Date() ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>
                        Expires: {formatDate(record.expirationDate)}
                      </p>
                    )}
                  </div>
                  <Badge variant={record.isEligible ? 'success' : 'danger'}>
                    {record.isEligible ? 'Eligible' : 'Not Eligible'}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Check Eligibility Modal */}
      <Modal
        isOpen={isCheckModalOpen}
        onClose={() => setIsCheckModalOpen(false)}
        title="Check State Assistance Eligibility"
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
                <CheckCircle className="w-8 h-8 text-green-600" />
              ) : (
                <XCircle className="w-8 h-8 text-red-600" />
              )}
            </div>
            <h3 className={`text-xl font-bold mt-4 ${checkResult.isEligible ? 'text-green-600' : 'text-red-600'}`}>
              {checkResult.isEligible ? 'Eligible for State Assistance' : 'Not Eligible'}
            </h3>
            {checkResult.type && (
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Eligibility Type: <span className="font-medium">{checkResult.type}</span>
              </p>
            )}
            {checkResult.isEligible && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                This beneficiary may qualify for DSNP plans with $0 premium.
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
              label="State Assistance Number"
              value={checkForm.stateAssistanceNumber}
              onChange={(e) => setCheckForm({ ...checkForm, stateAssistanceNumber: e.target.value })}
              placeholder="SA-12345678"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="State"
                value={checkForm.state}
                onChange={(e) => setCheckForm({ ...checkForm, state: e.target.value })}
                placeholder="FL"
              />
              <Input
                label="Date of Birth"
                type="date"
                value={checkForm.dateOfBirth}
                onChange={(e) => setCheckForm({ ...checkForm, dateOfBirth: e.target.value })}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="Eligibility Details"
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
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{selectedRecord.leadName}</h3>
                <p className={`text-sm ${selectedRecord.isEligible ? 'text-green-600' : 'text-red-600'}`}>
                  {selectedRecord.isEligible ? `Eligible - ${selectedRecord.eligibilityType}` : 'Not Eligible'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">State Assistance Number</p>
                <p className="font-medium text-gray-900 dark:text-white">{selectedRecord.stateAssistanceNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">State</p>
                <p className="font-medium text-gray-900 dark:text-white">{selectedRecord.state}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Verification Date</p>
                <p className="font-medium text-gray-900 dark:text-white">{formatDate(selectedRecord.verificationDate)}</p>
              </div>
              {selectedRecord.expirationDate && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Expiration Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatDate(selectedRecord.expirationDate)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

