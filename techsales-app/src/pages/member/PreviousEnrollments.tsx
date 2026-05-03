import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Filter
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button, Badge } from '../../components/common';
import { getLogoByTheme } from '../../utils/logoUtils';

// Sample previous enrollment data for demo purposes
interface PreviousEnrollment {
  enrollmentId: string;
  planName: string;
  planType: string;
  carrier: string;
  enrollmentDate: string;
  effectiveDate: string;
  terminationDate?: string;
  enrollmentType: string;
  enrollmentPeriod: string;
  status: 'Active' | 'Terminated' | 'Cancelled' | 'Expired';
  premium: number;
  confirmationNumber?: string;
}

// Sample data - in a real app this would come from an API
// One enrollment per year, Active for current year (2026), rest are expired
const samplePreviousEnrollments: PreviousEnrollment[] = [
  {
    enrollmentId: 'ENROLL-2026-001',
    planName: 'Carrier 1 Medicare Advantage Elite',
    planType: 'PPO',
    carrier: 'Carrier 1',
    enrollmentDate: '2025-11-10',
    effectiveDate: '2026-01-01',
    enrollmentType: 'Plan Change',
    enrollmentPeriod: 'AEP',
    status: 'Active',
    premium: 55,
    confirmationNumber: 'CONF-2026-JKL345'
  },
  {
    enrollmentId: 'ENROLL-2025-001',
    planName: 'Carrier 1 Medicare Advantage PPO',
    planType: 'PPO',
    carrier: 'Carrier 1',
    enrollmentDate: '2024-11-15',
    effectiveDate: '2025-01-01',
    terminationDate: '2025-12-31',
    enrollmentType: 'New Enrollment',
    enrollmentPeriod: 'AEP',
    status: 'Expired',
    premium: 45,
    confirmationNumber: 'CONF-2025-ABC123'
  },
  {
    enrollmentId: 'ENROLL-2024-001',
    planName: 'Carrier 2 Gold Plus HMO',
    planType: 'HMO',
    carrier: 'Carrier 2',
    enrollmentDate: '2023-10-20',
    effectiveDate: '2024-01-01',
    terminationDate: '2024-12-31',
    enrollmentType: 'Plan Change',
    enrollmentPeriod: 'AEP',
    status: 'Expired',
    premium: 0,
    confirmationNumber: 'CONF-2024-XYZ789'
  },
  {
    enrollmentId: 'ENROLL-2023-001',
    planName: 'Carrier 1 Medicare Advantage HMO',
    planType: 'HMO',
    carrier: 'Carrier 1',
    enrollmentDate: '2022-11-01',
    effectiveDate: '2023-01-01',
    terminationDate: '2023-12-31',
    enrollmentType: 'New Enrollment',
    enrollmentPeriod: 'AEP',
    status: 'Expired',
    premium: 35,
    confirmationNumber: 'CONF-2023-DEF456'
  },
  {
    enrollmentId: 'ENROLL-2022-001',
    planName: 'Original Medicare with Part D',
    planType: 'PDP',
    carrier: 'Carrier 2',
    enrollmentDate: '2021-12-01',
    effectiveDate: '2022-01-01',
    terminationDate: '2022-12-31',
    enrollmentType: 'New Enrollment',
    enrollmentPeriod: 'IEP',
    status: 'Expired',
    premium: 25.50,
    confirmationNumber: 'CONF-2022-GHI012'
  }
];

export function PreviousEnrollments() {
  const { member, logout } = useAuth();
  const { colorTheme } = useTheme();
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<PreviousEnrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    const loadEnrollments = async () => {
      if (!member) {
        navigate('/member/login');
        return;
      }

      setIsLoading(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setEnrollments(samplePreviousEnrollments);
      setIsLoading(false);
    };

    loadEnrollments();
  }, [member, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/member/login');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getStatusBadge = (status: PreviousEnrollment['status']) => {
    switch (status) {
      case 'Active':
        return <Badge variant="success" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Active</Badge>;
      case 'Terminated':
        return <Badge variant="danger" className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Terminated</Badge>;
      case 'Cancelled':
        return <Badge variant="warning" className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Cancelled</Badge>;
      case 'Expired':
        return <Badge variant="default" className="flex items-center gap-1"><Clock className="w-3 h-3" /> Expired</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  const filteredEnrollments = filterStatus === 'all' 
    ? enrollments 
    : enrollments.filter(e => e.status === filterStatus);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading enrollment history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <img 
                src={getLogoByTheme(colorTheme)} 
                alt="Carrier Logo"
                className="h-8 w-auto"
              />
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Enrollment History
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  View your previous plan enrollments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => navigate('/member/dashboard')}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filter Section */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Filter by status:</span>
            <div className="flex gap-2">
              {['all', 'Active', 'Expired'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    filterStatus === status
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {status === 'all' ? 'All' : status}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredEnrollments.length} enrollment{filteredEnrollments.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {/* Enrollments Table */}
        {filteredEnrollments.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No enrollments found
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              {filterStatus === 'all' 
                ? "You don't have any previous enrollments on record."
                : `No enrollments with status "${filterStatus}" found.`}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Plan Details
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Enrollment Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Effective Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      End Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Premium
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Confirmation #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredEnrollments.map((enrollment) => (
                    <tr 
                      key={enrollment.enrollmentId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {enrollment.planName}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="primary" className="text-xs">{enrollment.planType}</Badge>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {enrollment.carrier}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {enrollment.enrollmentType}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {enrollment.enrollmentPeriod}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-900 dark:text-white">
                          {formatDate(enrollment.effectiveDate)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-900 dark:text-white">
                          {enrollment.terminationDate 
                            ? formatDate(enrollment.terminationDate) 
                            : <span className="text-gray-400">—</span>}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {enrollment.premium === 0 
                            ? <span className="text-green-600 dark:text-green-400">$0</span>
                            : formatCurrency(enrollment.premium)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">/month</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-900 dark:text-white font-mono">
                          {enrollment.confirmationNumber || <span className="text-gray-400">—</span>}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(enrollment.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary Section */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            Enrollment Summary
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{enrollments.length}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Enrollments</p>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {enrollments.filter(e => e.status === 'Active').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">
                {enrollments.filter(e => e.status === 'Expired').length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Expired</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
