import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Filter, 
  X, 
  FileText,
  Calendar,
  User,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  Eye,
  Download
} from 'lucide-react';
import { Button, Select, Badge, Pagination, Modal, Input, DatePicker } from '../../components/common';
import { SearchInput } from '../../components/common/SearchInput';
import { LeadAutocomplete } from '../../components/common/LeadAutocomplete';
import { EmptyState } from '../../components/common/EmptyState';
import { useAuth } from '../../context/AuthContext';
import type { PBA, PBAStatus, Lead } from '../../types';

// Mock PBA data
const mockPBAs: PBA[] = [
  {
    pbaId: 'PBA-001',
    leadId: 'LEAD-001',
    leadName: 'John Smith',
    agentId: 'USR-001',
    agentName: 'Demo Agent',
    status: 'completed',
    appointmentDate: '2025-01-15',
    appointmentTime: '10:00 AM',
    discussedTopics: ['MAPD', 'PDP', 'DSNP'],
    signedDate: '2025-01-15',
    createdAt: '2025-01-10T10:00:00Z',
  },
  {
    pbaId: 'PBA-002',
    leadId: 'LEAD-002',
    leadName: 'Mary Johnson',
    agentId: 'USR-001',
    agentName: 'Demo Agent',
    status: 'pending',
    appointmentDate: '2025-01-20',
    appointmentTime: '2:00 PM',
    discussedTopics: ['MAPD'],
    createdAt: '2025-01-12T14:00:00Z',
  },
  {
    pbaId: 'PBA-003',
    leadId: 'LEAD-003',
    leadName: 'Robert Williams',
    agentId: 'USR-001',
    agentName: 'Demo Agent',
    status: 'sent',
    appointmentDate: '2025-01-18',
    appointmentTime: '11:00 AM',
    discussedTopics: ['PDP', 'DSNP'],
    sentDate: '2025-01-14',
    createdAt: '2025-01-11T09:00:00Z',
  },
  {
    pbaId: 'PBA-004',
    leadId: 'LEAD-004',
    leadName: 'Patricia Brown',
    agentId: 'USR-001',
    agentName: 'Demo Agent',
    status: 'expired',
    appointmentDate: '2024-12-15',
    appointmentTime: '3:00 PM',
    discussedTopics: ['MAPD'],
    createdAt: '2024-12-10T15:00:00Z',
  },
];

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
];

const getStatusConfig = (status: PBAStatus) => {
  switch (status) {
    case 'pending':
      return { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', label: 'Pending' };
    case 'sent':
      return { icon: Send, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', label: 'Sent' };
    case 'completed':
      return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30', label: 'Completed' };
    case 'expired':
      return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', label: 'Expired' };
    default:
      return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-900/30', label: status };
  }
};

export function PBAList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pbas, setPBAs] = useState<PBA[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPBA, setSelectedPBA] = useState<PBA | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [appointmentDate, setAppointmentDate] = useState<string>('');
  const [appointmentTime, setAppointmentTime] = useState<string>('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  // Load PBAs
  useEffect(() => {
    setIsLoading(true);
    setTimeout(() => {
      let filtered = [...mockPBAs];
      if (searchTerm) {
        filtered = filtered.filter(s => 
          s.leadName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.pbaId.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      if (statusFilter) {
        filtered = filtered.filter(s => s.status === statusFilter);
      }
      setPBAs(filtered);
      setIsLoading(false);
    }, 300);
  }, [searchTerm, statusFilter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const viewDetails = (pba: PBA) => {
    setSelectedPBA(pba);
    setIsDetailOpen(true);
  };

  // Stats
  const stats = {
    total: mockPBAs.length,
    pending: mockPBAs.filter(s => s.status === 'pending').length,
    sent: mockPBAs.filter(s => s.status === 'sent').length,
    completed: mockPBAs.filter(s => s.status === 'completed').length,
    expired: mockPBAs.filter(s => s.status === 'expired').length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scope of Appointments (SOA)</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage SOA forms for Medicare sales appointments
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          New SOA
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
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
          <p className="text-sm text-green-600">Completed</p>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-red-600">Expired</p>
          <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by lead name or SOA ID..."
          className="flex-1 max-w-md"
        />
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
      </div>

      {/* PBA List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
        </div>
      ) : pbas.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No SOA records found"
          description="Create a new SOA to get started"
          action={<Button onClick={() => setIsCreateOpen(true)}><Plus className="w-4 h-4" />New SOA</Button>}
        />
      ) : (
        <div className="space-y-3">
          {pbas.map((pba) => {
            const statusConfig = getStatusConfig(pba.status);
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={pba.pbaId}
                onClick={() => viewDetails(pba)}
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
                          {pba.leadName}
                        </h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {pba.pbaId}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(pba.appointmentDate)} at {pba.appointmentTime}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {pba.agentName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {pba.discussedTopics.map((topic) => (
                        <Badge key={topic} variant="default">{topic}</Badge>
                      ))}
                    </div>
                    <Badge variant={
                      pba.status === 'completed' ? 'success' :
                      pba.status === 'sent' ? 'info' :
                      pba.status === 'expired' ? 'danger' : 'warning'
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
        title="SOA Details"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Close</Button>
            <Button variant="outline"><Download className="w-4 h-4" />Download PDF</Button>
            {selectedPBA?.status === 'pending' && (
              <Button><Send className="w-4 h-4" />Send to Beneficiary</Button>
            )}
          </>
        }
      >
        {selectedPBA && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">SOA ID</p>
                <p className="font-medium text-gray-900 dark:text-white">{selectedPBA.pbaId}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                <Badge variant={
                  selectedPBA.status === 'completed' ? 'success' :
                  selectedPBA.status === 'sent' ? 'info' :
                  selectedPBA.status === 'expired' ? 'danger' : 'warning'
                }>
                  {getStatusConfig(selectedPBA.status).label}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Beneficiary</p>
                <p className="font-medium text-gray-900 dark:text-white">{selectedPBA.leadName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Agent</p>
                <p className="font-medium text-gray-900 dark:text-white">{selectedPBA.agentName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Appointment Date</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatDate(selectedPBA.appointmentDate)} at {selectedPBA.appointmentTime}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatDate(selectedPBA.createdAt)}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Topics to Discuss</p>
              <div className="flex gap-2">
                {selectedPBA.discussedTopics.map((topic) => (
                  <Badge key={topic} variant="primary">{topic}</Badge>
                ))}
              </div>
            </div>

            {selectedPBA.signedDate && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-400">
                  ✓ Signed on {formatDate(selectedPBA.signedDate)}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New SOA"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => {
              setIsCreateOpen(false);
              // Reset form
              setSelectedLeadId('');
              setSelectedLead(null);
              setAppointmentDate('');
              setAppointmentTime('');
              setSelectedTopics([]);
            }}>Cancel</Button>
            <Button onClick={() => {
              // TODO: Implement create SOA logic
              setIsCreateOpen(false);
              // Reset form
              setSelectedLeadId('');
              setSelectedLead(null);
              setAppointmentDate('');
              setAppointmentTime('');
              setSelectedTopics([]);
            }}>Create SOA</Button>
          </>
        }
      >
        <div className="space-y-4">
          <LeadAutocomplete
            label="Lead/Beneficiary"
            value={selectedLeadId}
            onChange={(leadId, lead) => {
              setSelectedLeadId(leadId);
              setSelectedLead(lead);
            }}
            placeholder="Type to search for a lead..."
          />
          {selectedLead && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <div className="font-medium text-gray-900 dark:text-white">
                  {selectedLead.firstName} {selectedLead.lastName}
                </div>
                <div className="mt-1">
                  {selectedLead.email} • {selectedLead.phone}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <DatePicker 
              label="Appointment Date" 
              value={appointmentDate} 
              onChange={(date) => setAppointmentDate(date)} 
              required
            />
            <Input 
              label="Appointment Time" 
              type="time" 
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Topics to Discuss
            </label>
            <div className="flex flex-wrap gap-2">
              {['MAPD', 'PDP', 'DSNP', 'CSNP', 'MedSupp'].map((topic) => (
                <label key={topic} className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedTopics.includes(topic)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTopics([...selectedTopics, topic]);
                      } else {
                        setSelectedTopics(selectedTopics.filter(t => t !== topic));
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" 
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{topic}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

