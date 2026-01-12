import { useState, useEffect } from 'react';
import { 
  Plus, 
  Mail,
  Calendar,
  User,
  CheckCircle,
  Clock,
  Eye,
  Send,
  Package,
  ExternalLink
} from 'lucide-react';
import { Button, Select, Badge, Modal, Input } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { LeadAutocomplete } from '../../components/common/LeadAutocomplete';
import { EmptyState } from '../../components/common/EmptyState';
import type { PBKit, PBKitStatus, Lead } from '../../types';

// Mock PBKit data
const mockPBKits: PBKit[] = [
  {
    pbkitId: 'PBKIT-001',
    leadId: 'LEAD-001',
    leadName: 'John Smith',
    leadEmail: 'john.smith@email.com',
    agentId: 'USR-001',
    agentName: 'Demo Agent',
    status: 'opened',
    planIds: ['PLAN-001', 'PLAN-002'],
    planNames: ['Blue Cross MAPD Gold', 'Aetna PPO Select'],
    sentDate: '2025-01-10T10:00:00Z',
    openedDate: '2025-01-10T14:30:00Z',
    createdAt: '2025-01-10T09:00:00Z',
  },
  {
    pbkitId: 'PBKIT-002',
    leadId: 'LEAD-002',
    leadName: 'Mary Johnson',
    leadEmail: 'mary.j@email.com',
    agentId: 'USR-001',
    agentName: 'Demo Agent',
    status: 'sent',
    planIds: ['PLAN-003'],
    planNames: ['Humana PDP Basic'],
    sentDate: '2025-01-12T11:00:00Z',
    createdAt: '2025-01-12T10:00:00Z',
  },
  {
    pbkitId: 'PBKIT-003',
    leadId: 'LEAD-003',
    leadName: 'Robert Williams',
    leadEmail: 'rwilliams@email.com',
    agentId: 'USR-001',
    agentName: 'Demo Agent',
    status: 'pending',
    planIds: ['PLAN-001'],
    planNames: ['Blue Cross MAPD Gold'],
    createdAt: '2025-01-14T15:00:00Z',
  },
];

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'opened', label: 'Opened' },
  { value: 'clicked', label: 'Clicked' },
];

const getStatusConfig = (status: PBKitStatus) => {
  switch (status) {
    case 'pending':
      return { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', label: 'Pending' };
    case 'sent':
      return { icon: Send, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', label: 'Sent' };
    case 'opened':
      return { icon: Eye, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30', label: 'Opened' };
    case 'clicked':
      return { icon: ExternalLink, color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30', label: 'Clicked' };
    default:
      return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-900/30', label: status };
  }
};

export function PBKitList() {
  const [pbkits, setPBKits] = useState<PBKit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPBKit, setSelectedPBKit] = useState<PBKit | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Load PBKits
  useEffect(() => {
    setIsLoading(true);
    setTimeout(() => {
      let filtered = [...mockPBKits];
      if (searchTerm) {
        filtered = filtered.filter(e => 
          e.leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.leadEmail.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      if (statusFilter) {
        filtered = filtered.filter(e => e.status === statusFilter);
      }
      setPBKits(filtered);
      setIsLoading(false);
    }, 300);
  }, [searchTerm, statusFilter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Stats
  const stats = {
    total: mockPBKits.length,
    pending: mockPBKits.filter(e => e.status === 'pending').length,
    sent: mockPBKits.filter(e => e.status === 'sent').length,
    opened: mockPBKits.filter(e => e.status === 'opened').length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Plan Electronic Kit (P-EKIT)</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Send plan information packages to beneficiaries
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New P-EKIT
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Sent</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-amber-600">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-blue-600">Sent</p>
          <p className="text-2xl font-bold text-blue-600">{stats.sent}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-green-600">Opened</p>
          <p className="text-2xl font-bold text-green-600">{stats.opened}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by name or email..."
          className="flex-1 max-w-md"
        />
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
      </div>

      {/* PBKit List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
        </div>
      ) : pbkits.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No P-EKIT records found"
          description="Create a new P-EKIT to send plan information"
          action={<Button onClick={() => setIsCreateOpen(true)}><Plus className="w-4 h-4" />New P-EKIT</Button>}
        />
      ) : (
        <div className="space-y-3">
          {pbkits.map((pbkit) => {
            const statusConfig = getStatusConfig(pbkit.status);
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={pbkit.pbkitId}
                onClick={() => {
                  setSelectedPBKit(pbkit);
                  setIsDetailOpen(true);
                }}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg hover:border-orange-300 dark:hover:border-orange-700 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${statusConfig.bg}`}>
                      <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {pbkit.leadName}
                        </h3>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {pbkit.leadEmail}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {pbkit.planNames.length} plan(s)
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(pbkit.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex gap-1 max-w-xs overflow-hidden">
                      {pbkit.planNames.slice(0, 2).map((plan, i) => (
                        <Badge key={i} variant="default" className="truncate max-w-32">{plan}</Badge>
                      ))}
                      {pbkit.planNames.length > 2 && (
                        <Badge variant="default">+{pbkit.planNames.length - 2}</Badge>
                      )}
                    </div>
                    <Badge variant={
                      pbkit.status === 'opened' || pbkit.status === 'clicked' ? 'success' :
                      pbkit.status === 'sent' ? 'info' : 'warning'
                    }>
                      {statusConfig.label}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title="P-EKIT Details"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
            {selectedPBKit?.status === 'pending' && (
              <Button><Send className="w-4 h-4" />Send Now</Button>
            )}
            {selectedPBKit?.status !== 'pending' && (
              <Button variant="outline"><Send className="w-4 h-4" />Resend</Button>
            )}
          </>
        }
      >
        {selectedPBKit && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Recipient</p>
                <p className="font-medium text-gray-900 dark:text-white">{selectedPBKit.leadName}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedPBKit.leadEmail}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                <Badge variant={
                  selectedPBKit.status === 'opened' || selectedPBKit.status === 'clicked' ? 'success' :
                  selectedPBKit.status === 'sent' ? 'info' : 'warning'
                }>
                  {getStatusConfig(selectedPBKit.status).label}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
                <p className="font-medium text-gray-900 dark:text-white">{formatDate(selectedPBKit.createdAt)}</p>
              </div>
              {selectedPBKit.sentDate && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Sent</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatDate(selectedPBKit.sentDate)}</p>
                </div>
              )}
              {selectedPBKit.openedDate && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Opened</p>
                  <p className="font-medium text-green-600">{formatDate(selectedPBKit.openedDate)}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Included Plans</p>
              <div className="space-y-2">
                {selectedPBKit.planNames.map((plan, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <Package className="w-4 h-4 text-orange-600" />
                    <span className="text-gray-900 dark:text-white">{plan}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New P-EKIT"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => setIsCreateOpen(false)}><Send className="w-4 h-4" />Create & Send</Button>
          </>
        }
      >
        <div className="space-y-4">
          <LeadAutocomplete
            label="Lead/Beneficiary"
            value=""
            onChange={(leadId, lead) => {
              // Handle lead selection
            }}
            placeholder="Type to search for a lead..."
          />
          <Input label="Email Address" type="email" placeholder="recipient@email.com" />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Plans to Include
            </label>
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
              {['Blue Cross MAPD Gold', 'Aetna PPO Select', 'Humana PDP Basic', 'UHC DSNP Complete'].map((plan) => (
                <label key={plan} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                  <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-orange-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{plan}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

