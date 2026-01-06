import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, 
  Calendar, 
  Mail, 
  MessageSquare, 
  Phone,
  User,
  Shield,
  FileText,
  Clock,
  MapPin,
  Star,
  DollarSign,
  Info
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button, Badge } from '../../components/common';
import { getMemberById, getMemberAppointments } from '../../services/memberService';
import { getPlanById, getPlanRating } from '../../services/planService';
import type { Member, MemberAppointment, Plan } from '../../types';
import { getLogoByTheme } from '../../utils/logoUtils';

export function MemberDashboard() {
  const { member, logout } = useAuth();
  const { colorTheme, setColorTheme } = useTheme();
  const navigate = useNavigate();
  const [memberData, setMemberData] = useState<Member | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [appointments, setAppointments] = useState<MemberAppointment[]>([]);
  const [starRating, setStarRating] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMemberData = async () => {
      if (!member) {
        navigate('/member/login');
        return;
      }

      setIsLoading(true);

      // Set theme based on member's carrier
      if (member.carrier === 'Aetna') {
        setColorTheme('aetna');
      } else if (member.carrier === 'Humana') {
        setColorTheme('humana');
      }

      // Load member details, plan, and appointments
      const [memberResult, planResult, appointmentsResult, ratingResult] = await Promise.all([
        getMemberById(member.memberId),
        getPlanById(member.planId),
        getMemberAppointments(member.memberId),
        getPlanRating(member.planId),
      ]);

      if (memberResult.success && memberResult.data) {
        setMemberData(memberResult.data);
      }

      if (planResult.success && planResult.data) {
        setPlan(planResult.data);
      }

      if (appointmentsResult.success && appointmentsResult.data) {
        setAppointments(appointmentsResult.data);
      }

      if (ratingResult.success && ratingResult.data) {
        setStarRating(ratingResult.data.overallRating);
      }

      setIsLoading(false);
    };

    loadMemberData();
  }, [member, navigate, setColorTheme]);

  const handleLogout = () => {
    logout();
    navigate('/member/login');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (timeString: string) => {
    return timeString;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading your information...</p>
        </div>
      </div>
    );
  }

  if (!memberData || !plan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400">Unable to load member information</p>
          <Button onClick={handleLogout} className="mt-4">Return to Login</Button>
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
                alt={memberData.carrier}
                className="h-8 w-auto"
              />
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Member Portal
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Welcome, {memberData.firstName} {memberData.lastName}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout} leftIcon={<LogOut className="w-4 h-4" />}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Personal Information and Plan Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <User className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Personal Information
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Full Name</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {memberData.firstName} {memberData.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Date of Birth</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(memberData.dateOfBirth)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Policy Number</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {memberData.policyNumber}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Email</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {memberData.email || 'Not provided'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Phone</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {memberData.phone || 'Not provided'}
                  </p>
                </div>
                {memberData.address && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Address</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {memberData.address.street}<br />
                      {memberData.address.city}, {memberData.address.state} {memberData.address.zipCode}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Plan Information Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Shield className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Plan Information
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    {plan.planName}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <span>Contract: {plan.contractNumber}</span>
                    <span>•</span>
                    <span>PBP: {plan.pbp}</span>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {starRating.toFixed(1)} Star Rating
                    </span>
                  </div>
                  <Badge variant={plan.product === 'MAPD' ? 'primary' : 'info'}>
                    {plan.product}
                  </Badge>
                  <Badge variant="default">{plan.planType}</Badge>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <strong>Marketing Name:</strong> {plan.marketingName}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <strong>Status:</strong> {plan.planStatus}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <strong>Market:</strong> {plan.market} • {plan.region}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/member/plan/${member.planId}`)}
                    className="w-full"
                    leftIcon={<Info className="w-4 h-4" />}
                  >
                    View Full Plan Details
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Appointments & Contact */}
          <div className="space-y-6">
            {/* Upcoming Appointments */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Calendar className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Upcoming Appointments
                </h2>
              </div>

              {appointments.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No upcoming appointments scheduled
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {appointments.map((apt) => (
                    <div
                      key={apt.appointmentId}
                      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {apt.appointmentType}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            with {apt.agentName}
                          </p>
                        </div>
                        <Badge variant="info">{apt.status}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mt-2">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(apt.scheduledDate)} at {formatTime(apt.scheduledTime)}</span>
                      </div>
                      {apt.notes && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                          {apt.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contact Your Agent */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-6">
                <MessageSquare className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Contact Your Agent
                </h2>
              </div>

              {memberData.assignedAgentId ? (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                      Your assigned agent is available to help with:
                    </p>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                      <li>Plan questions and benefits</li>
                      <li>Coverage inquiries</li>
                      <li>Appointment scheduling</li>
                      <li>Plan changes and updates</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      leftIcon={<Mail className="w-4 h-4" />}
                      onClick={() => {
                        window.location.href = `mailto:agent@medicarehub.com?subject=Question about Policy ${memberData.policyNumber}`;
                      }}
                    >
                      Send Email
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      leftIcon={<Phone className="w-4 h-4" />}
                      onClick={() => {
                        window.location.href = 'tel:1-800-MEDICARE';
                      }}
                    >
                      Call Support
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Info className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No agent assigned. Contact support for assistance.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    leftIcon={<Phone className="w-4 h-4" />}
                    onClick={() => {
                      window.location.href = 'tel:1-800-MEDICARE';
                    }}
                  >
                    Contact Support
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
