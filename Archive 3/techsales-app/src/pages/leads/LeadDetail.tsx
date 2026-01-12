import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Edit2, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar,
  User,
  Building2,
  Pill,
  FileText,
  Activity,
  Clock,
  Circle,
  Check,
  Sparkles,
  ClipboardCheck,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button, Badge } from '../../components/common';
import { Tabs, TabPanel } from '../../components/common/Tabs';
import { StatusBadge } from '../../components/common/StatusBadge';
import type { Lead, LeadStatus } from '../../types';
import { getLeadById } from '../../services/leadService';
import { getAllDrugs } from '../../services/drugService';
import { getAllProviders } from '../../services/providerService';
import { calculateAge } from '../../utils/dateUtils';

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [drugMap, setDrugMap] = useState<Record<string, string>>({});
  const [providerMap, setProviderMap] = useState<Record<string, { name: string; npi: string }>>({});

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      setIsLoading(true);
      
      // Load lead
      const leadResult = await getLeadById(id);
      if (leadResult.success && leadResult.data) {
        setLead(leadResult.data);
      }
      
      // Load drugs for lookup
      const drugsResult = await getAllDrugs();
      if (drugsResult.success && drugsResult.data) {
        const map: Record<string, string> = {};
        drugsResult.data.forEach(drug => {
          map[drug.drugId] = drug.drugLabelName || drug.brandName || drug.genericName;
        });
        setDrugMap(map);
      }
      
      // Load providers for lookup
      const providersResult = await getAllProviders();
      if (providersResult.success && providersResult.data) {
        const map: Record<string, { name: string; npi: string }> = {};
        providersResult.data.forEach(provider => {
          map[provider.providerId] = { name: provider.providerName, npi: provider.npi };
        });
        setProviderMap(map);
      }
      
      setIsLoading(false);
    };
    loadData();
  }, [id]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return phone;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading lead details...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Lead not found</h2>
          <Button variant="outline" onClick={() => navigate('/leads')} className="mt-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Leads
          </Button>
        </div>
      </div>
    );
  }

  // Lead lifecycle stages in order (normal progression)
  const normalStages: LeadStatus[] = [
    'New Lead',
    'Contacted Lead',
    'Appointment Schedule',
    'Enrollment in progress',
    'Enrolled',
  ];

  // Terminal stages (these are end states, not part of normal progression)
  const terminalStages: LeadStatus[] = [
    'Dropped / Lost lead',
  ];

  // Get the current stage index
  const getCurrentStageIndex = (status: LeadStatus): number => {
    return normalStages.indexOf(status);
  };

  // Get icon for each lifecycle stage
  const getStageIcon = (stage: LeadStatus) => {
    switch (stage) {
      case 'New Lead': return Sparkles;
      case 'Contacted Lead': return Phone;
      case 'Appointment Schedule': return Calendar;
      case 'Enrollment in progress': return ClipboardCheck;
      case 'Enrolled': return CheckCircle;
      case 'Dropped / Lost lead': return XCircle;
      default: return Circle;
    }
  };

  const currentStatus = lead.leadStatus || 'New Lead';
  const currentStageIndex = getCurrentStageIndex(currentStatus);
  const isTerminalStage = terminalStages.includes(currentStatus);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'pharmacies', label: 'Pharmacies', icon: Building2, badge: lead.taggedPharmacies?.length || 0 },
    { id: 'drugs', label: 'Drugs', icon: Pill, badge: lead.taggedDrugs?.length || 0 },
    { id: 'providers', label: 'Providers', icon: User, badge: lead.taggedProviders?.length || 0 },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/leads')}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Leads
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-xl font-bold">
              {lead.firstName[0]}{lead.lastName[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {lead.firstName} {lead.lastName}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <StatusBadge status={lead.leadStatus} size="md" />
                {lead.medicaidId && <Badge variant="warning">Dual Eligible</Badge>}
              </div>
            </div>
          </div>
                 {/* Lead Lifecycle Timeline */}
       <div className="flex-1 min-w-0 mx-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
         <div className="relative" style={{ height: '80px' }}>
           {/* Horizontal timeline line - centered vertically */}
           <div className="absolute left-0 right-0 h-0.5 bg-gray-200 dark:bg-gray-700" style={{ top: '50%', transform: 'translateY(-50%)' }} />
           
           <div className="relative flex items-start justify-between h-full">
             {/* Normal progression stages */}
             {normalStages.map((stage, index) => {
               const isCompleted = !isTerminalStage && index <= currentStageIndex;
               const isCurrent = !isTerminalStage && index === currentStageIndex;
               
               // Get color for each stage
               const getStageColor = (stageName: LeadStatus) => {
                 switch (stageName) {
                   case 'New Lead': return 'blue';
                   case 'Contacted Lead': return 'purple';
                   case 'Appointment Schedule': return 'cyan';
                   case 'Enrollment in progress': return 'amber';
                   case 'Enrolled': return 'green';
                   default: return 'gray';
                 }
               };
               
               const stageColor = getStageColor(stage);
               const StageIcon = getStageIcon(stage);
               
               return (
                 <div key={stage} className="relative flex flex-col items-center h-full" style={{ flex: 1 }}>
                   {/* Green checkmark badge at top for completed stages */}
                   {isCompleted && (
                     <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-20">
                       <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center border-2 border-white dark:border-gray-800 shadow-sm">
                         <Check className="w-3 h-3 text-white" />
                       </div>
                     </div>
                   )}
                   
                   {/* Timeline dot - centered on the line */}
                   <div className="absolute z-10 flex items-center justify-center" style={{ top: '50%', transform: 'translateY(-50%)' }}>
                     {isCompleted ? (
                       <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                         isCurrent 
                           ? `ring-2 shadow-md bg-green-600 ring-green-200 dark:ring-green-900/50`
                           : `${
                               stageColor === 'blue' ? 'bg-blue-500' :
                               stageColor === 'purple' ? 'bg-purple-500' :
                               stageColor === 'cyan' ? 'bg-cyan-500' :
                               stageColor === 'amber' ? 'bg-amber-500' :
                               'bg-green-500'
                             }`
                       }`}>
                         <StageIcon className="w-6 h-6 text-white" />
                       </div>
                     ) : (
                       <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-800">
                         <StageIcon className="w-6 h-6 text-gray-400" />
                       </div>
                     )}
                   </div>
                   
                   {/* Stage name - positioned below */}
                   <div className="absolute bottom-0 left-0 right-0 text-center">
                     <div className={`text-xs font-medium leading-tight px-1 ${
                       isCurrent 
                         ? `${
                             stageColor === 'blue' ? 'text-blue-700 dark:text-blue-400' :
                             stageColor === 'purple' ? 'text-purple-700 dark:text-purple-400' :
                             stageColor === 'cyan' ? 'text-cyan-700 dark:text-cyan-400' :
                             stageColor === 'amber' ? 'text-amber-700 dark:text-amber-400' :
                             'text-green-700 dark:text-green-400'
                           }`
                         : isCompleted 
                           ? `${
                               stageColor === 'blue' ? 'text-blue-600 dark:text-blue-300' :
                               stageColor === 'purple' ? 'text-purple-600 dark:text-purple-300' :
                               stageColor === 'cyan' ? 'text-cyan-600 dark:text-cyan-300' :
                               stageColor === 'amber' ? 'text-amber-600 dark:text-amber-300' :
                               'text-green-600 dark:text-green-300'
                             }`
                           : 'text-gray-500 dark:text-gray-400'
                     }`}>
                       {stage}
                     </div>
                   </div>
                 </div>
               );
             })}
             
             {/* Terminal stage - show only if current */}
             {isTerminalStage && (
               <div className="relative flex flex-col items-center h-full" style={{ flex: 1 }}>
                 {/* Terminal badge - positioned above icon */}
                 <div className="absolute top-0 left-1/2 transform -translate-x-1/2 z-20">
                   <Badge variant="danger" size="sm">Terminal</Badge>
                 </div>
                 
                 <div className="absolute z-10 flex items-center justify-center" style={{ top: '50%', transform: 'translateY(-50%)' }}>
                   <div className="w-12 h-12 rounded-full flex items-center justify-center bg-red-600 ring-2 ring-red-200 dark:ring-red-900/50 shadow-md">
                     <XCircle className="w-6 h-6 text-white" />
                   </div>
                 </div>
                 <div className="absolute bottom-0 left-0 right-0 text-center">
                   <div className="text-xs font-medium leading-tight px-1 text-red-700 dark:text-red-400">
                     {currentStatus}
                   </div>
                 </div>
               </div>
             )}
           </div>
         </div>
       </div>
          <Button onClick={() => navigate(`/leads/${id}/edit`)}>
            <Edit2 className="w-4 h-4" />
            Edit Lead
          </Button>
        </div>
      </div>


      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Phone</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatPhone(lead.phone)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Mail className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
              <p className="font-medium text-gray-900 dark:text-white truncate">{lead.email}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Location</p>
              <p className="font-medium text-gray-900 dark:text-white">{lead.city}, {lead.state}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Age / DOB</p>
              <p className="font-medium text-gray-900 dark:text-white">{calculateAge(lead.dob)} years</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700 px-4">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} variant="underline" />
        </div>

        <div className="p-6">
          <TabPanel isActive={activeTab === 'overview'}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Personal Information
                </h3>
                <dl className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Full Name</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {lead.firstName} {lead.lastName}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Date of Birth</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.dob}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Age</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{calculateAge(lead.dob)} years</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">MBI</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.medicareNumber || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Part A Effective</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.partADate || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Part B Effective</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.partBDate || 'N/A'}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Source</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      <Badge variant="default">{lead.source || 'N/A'}</Badge>
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Address Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Address Information
                </h3>
                <dl className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Address</dt>
                    <dd className="font-medium text-gray-900 dark:text-white text-right">
                      {lead.address1}{lead.address2 ? `, ${lead.address2}` : ''}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">City</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.city}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">State</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.state}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">County</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.county}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Zip Code</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.zipCode}</dd>
                  </div>
                </dl>
              </div>

              {/* Medicare Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Medicare Information
                </h3>
                <dl className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Dual Eligible</dt>
                    <dd>
                      <Badge variant={lead.medicaidId ? 'success' : 'default'}>
                        {lead.medicaidId ? 'Yes' : 'No'}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Medicaid ID</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {lead.medicaidId || 'N/A'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* System Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  System Information
                </h3>
                <dl className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Lead ID</dt>
                    <dd className="font-mono text-sm text-gray-900 dark:text-white">{lead.leadId}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                    <dd className="text-gray-900 dark:text-white">{formatDate(lead.createdAt)}</dd>
                  </div>
                  {lead.updatedAt && (
                    <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                      <dt className="text-gray-500 dark:text-gray-400">Last Updated</dt>
                      <dd className="text-gray-900 dark:text-white">{formatDate(lead.updatedAt)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Created By</dt>
                    <dd className="text-gray-900 dark:text-white">{lead.createdBy || 'System'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </TabPanel>

          <TabPanel isActive={activeTab === 'pharmacies'}>
            {lead.taggedPharmacies && lead.taggedPharmacies.length > 0 ? (
              <div className="space-y-4">
                {lead.taggedPharmacies.map((pharmacy, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                        <Building2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{pharmacy}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Tagged pharmacy</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No pharmacies tagged for this lead</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate(`/leads/${id}/edit`)}>
                  Add Pharmacy
                </Button>
              </div>
            )}
          </TabPanel>

          <TabPanel isActive={activeTab === 'drugs'}>
            {lead.taggedDrugs && lead.taggedDrugs.length > 0 ? (
              <div className="space-y-4">
                {lead.taggedDrugs.map((drug, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                        <Pill className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {drug.drugName || drugMap[drug.drugId] || 'Unknown Drug'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {drug.dosage} • {drug.frequency} • Qty: {drug.quantity}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Pill className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No drugs tagged for this lead</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate(`/leads/${id}/edit`)}>
                  Add Drug
                </Button>
              </div>
            )}
          </TabPanel>

          <TabPanel isActive={activeTab === 'providers'}>
            {lead.taggedProviders && lead.taggedProviders.length > 0 ? (
              <div className="space-y-4">
                {lead.taggedProviders.map((providerId, index) => {
                  const provider = providerMap[providerId];
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                          <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {provider?.name || 'Unknown Provider'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            NPI: {provider?.npi || providerId}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No providers tagged for this lead</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate(`/leads/${id}/edit`)}>
                  Add Provider
                </Button>
              </div>
            )}
          </TabPanel>

          <TabPanel isActive={activeTab === 'documents'}>
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Document management coming soon</p>
            </div>
          </TabPanel>

          <TabPanel isActive={activeTab === 'activity'}>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Lead Created</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(lead.createdAt)}</p>
                </div>
              </div>
              {lead.updatedAt && lead.updatedAt !== lead.createdAt && (
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                    <Edit2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Lead Updated</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(lead.updatedAt)}</p>
                  </div>
                </div>
              )}
            </div>
          </TabPanel>
        </div>
      </div>
    </div>
  );
}

