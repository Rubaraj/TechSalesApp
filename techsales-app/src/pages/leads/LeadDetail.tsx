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
  Clock
} from 'lucide-react';
import { Button, Badge } from '../../components/common';
import { Tabs, TabPanel } from '../../components/common/Tabs';
import { StatusBadge } from '../../components/common/StatusBadge';
import type { Lead } from '../../types';
import { getLeadById } from '../../services/leadService';
import { calculateAge } from '../../utils/dateUtils';

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const loadLead = async () => {
      if (!id) return;
      setIsLoading(true);
      const result = await getLeadById(id);
      if (result.success && result.data) {
        setLead(result.data);
      }
      setIsLoading(false);
    };
    loadLead();
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
          <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'pharmacies', label: 'Pharmacies', icon: Building2, badge: lead.taggedPharmacies?.length || 0 },
    { id: 'drugs', label: 'Drugs', icon: Pill, badge: lead.taggedDrugs?.length || 0 },
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
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center text-white text-xl font-bold">
              {lead.firstName[0]}{lead.lastName[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {lead.firstName} {lead.lastName}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <StatusBadge status={lead.leadStatus} size="md" />
                {lead.isDualEligible && <Badge variant="warning">Dual Eligible</Badge>}
                {lead.isLISEligible && <Badge variant="info">LIS Eligible</Badge>}
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
                    <dd className="font-medium text-gray-900 dark:text-white">{lead.partBEffectiveDate || 'N/A'}</dd>
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
                    <dd className="font-medium text-gray-900 dark:text-white text-right">{lead.address}</dd>
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
                      <Badge variant={lead.isDualEligible ? 'success' : 'default'}>
                        {lead.isDualEligible ? 'Yes' : 'No'}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">LIS Eligible</dt>
                    <dd>
                      <Badge variant={lead.isLISEligible ? 'success' : 'default'}>
                        {lead.isLISEligible ? 'Yes' : 'No'}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Medicaid Number</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {lead.medicaidNumber || 'N/A'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                    <dt className="text-gray-500 dark:text-gray-400">Current Plan</dt>
                    <dd className="font-medium text-gray-900 dark:text-white">
                      {lead.currentPlanId || 'None'}
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
                    <dt className="text-gray-500 dark:text-gray-400">Assigned To</dt>
                    <dd className="text-gray-900 dark:text-white">{lead.assignedTo || 'Unassigned'}</dd>
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
                        <p className="font-medium text-gray-900 dark:text-white">{drug.drugName}</p>
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

