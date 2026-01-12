import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  Circle,
  FileText,
  User,
  Calendar,
  Phone,
  Mail,
  Save,
  Edit
} from 'lucide-react';
import { Button, Input, Select, Modal } from '../../components/common';
import { getPlanById } from '../../services/planService';
import { getLeadById } from '../../services/leadService';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import type { Plan } from '../../types/plan';
import type { Lead } from '../../types';
import type { EnrollmentFormData, ElectionPeriodType, RelationshipType } from '../../types/enrollmentForm';

const STEPS = [
  { id: 1, name: 'Election Period', key: 'election' },
  { id: 2, name: 'Contact Info', key: 'contact' },
  { id: 3, name: 'Other Info', key: 'other' },
  { id: 4, name: 'Payment', key: 'payment' },
];

export function EnrollmentForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('planId');
  const leadId = searchParams.get('leadId');
  const year = searchParams.get('year') || '2025';
  const { colorTheme } = useTheme();
  const { user } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState<EnrollmentFormData>({
    requestedEffectiveDate: '',
    electionPeriod: 'initial-enrollment',
    firstName: '',
    middleInitials: '',
    lastName: '',
    dateOfBirth: '',
    sex: 'Male',
    primaryPhone: '',
    email: '',
    preferredLanguage: 'English',
    preferredWrittenLanguage: 'English',
    relationshipToEnrollee: 'self',
    assistName: '',
    assistRelationship: 'Self',
    agentSignature: '',
    beneficiarySignature: '',
    allowEmailContact: false,
    scopeOfAppointment: false,
    releaseOfInformation: false,
    disclaimer: false,
  });

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      if (planId) {
        const planResult = await getPlanById(planId);
        if (planResult.success && planResult.data) {
          setPlan(planResult.data);
        }
      }

      if (leadId) {
        const leadResult = await getLeadById(leadId);
        if (leadResult.success && leadResult.data) {
          const l = leadResult.data;
          setLead(l);
          // Pre-fill form with lead data
          setFormData(prev => ({
            ...prev,
            firstName: l.firstName,
            lastName: l.lastName,
            dateOfBirth: l.dob,
            sex: l.gender,
            email: l.email,
            primaryPhone: l.phone,
            assistName: `${l.firstName} ${l.lastName}`,
          }));
        }
      }

      // Set default effective date (2 months from now)
      const defaultDate = new Date();
      defaultDate.setMonth(defaultDate.getMonth() + 2);
      setFormData(prev => ({
        ...prev,
        requestedEffectiveDate: defaultDate.toISOString().split('T')[0],
      }));

      setIsLoading(false);
    };

    loadData();
  }, [planId, leadId]);

  const updateFormData = (data: Partial<EnrollmentFormData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate('/enroll/select-plan', { state: { year } });
    }
  };

  const handleSaveDraft = () => {
    // TODO: Implement save draft functionality
    console.log('Saving draft...', formData);
  };

  const handleSubmit = () => {
    navigate('/enroll/submit', { 
      state: { 
        formData, 
        planId, 
        leadId, 
        year 
      } 
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading enrollment form...</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Plan not found</p>
          <Button onClick={() => navigate('/enroll/select-plan')} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const monthlyPremium = plan.premium?.monthly || 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-primary-600 dark:bg-primary-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={handleBack} className="p-2 hover:bg-primary-700 dark:hover:bg-primary-600 rounded-lg">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-semibold">Enrollment</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Left Sidebar */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6 sticky top-6">
              {/* Lead Information */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-5 h-5 text-gray-400" />
                  <h3 className="font-semibold text-gray-900 dark:text-white">Lead Information</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {lead ? `${lead.firstName} ${lead.lastName} | ${lead.gender === 'Male' ? '♂' : '♀'} - ${lead.age || 'N/A'}` : 'No lead selected'}
                </p>
              </div>

              {/* Plan Details */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-start justify-between mb-4">
                  <Button variant="outline" size="sm" leftIcon={<Edit className="w-3 h-3" />}>
                    Edit
                  </Button>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {plan.planName}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  ID {plan.planId}
                </p>
                <div className="border-t border-dashed border-gray-300 dark:border-gray-600 pt-4">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    ${monthlyPremium.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Monthly Premium
                  </div>
                </div>
              </div>

              {/* Plan Documents */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between cursor-pointer hover:text-primary-600 dark:hover:text-primary-400">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Plan Documents</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>

              {/* Contact Info */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Contact Information</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  833-859-6031 (TTY:711)
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  8 AM - 8 PM | 7 Days a Week
                </p>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
              {/* Progress Bar */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  {STEPS.map((step, index) => (
                    <div key={step.id} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div className={`
                          w-10 h-10 rounded-full flex items-center justify-center mb-2
                          ${currentStep > step.id 
                            ? 'bg-green-500 text-white' 
                            : currentStep === step.id
                            ? 'bg-primary-600 dark:bg-primary-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                          }
                        `}>
                          {currentStep > step.id ? (
                            <CheckCircle className="w-6 h-6" />
                          ) : (
                            <span className="font-semibold">{step.id}</span>
                          )}
                        </div>
                        <span className={`
                          text-xs font-medium
                          ${currentStep >= step.id 
                            ? 'text-gray-900 dark:text-white' 
                            : 'text-gray-500 dark:text-gray-400'
                          }
                        `}>
                          {step.name}
                        </span>
                      </div>
                      {index < STEPS.length - 1 && (
                        <div className={`
                          h-1 flex-1 mx-2 -mt-6
                          ${currentStep > step.id 
                            ? 'bg-green-500' 
                            : 'bg-gray-200 dark:bg-gray-700'
                          }
                        `} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step Content */}
              {currentStep === 1 && (
                <ElectionPeriodStep
                  formData={formData}
                  onUpdate={updateFormData}
                  onNext={handleNext}
                  onBack={handleBack}
                  onSaveDraft={handleSaveDraft}
                />
              )}

              {currentStep === 2 && (
                <ContactInfoStep
                  formData={formData}
                  onUpdate={updateFormData}
                  onNext={handleNext}
                  onBack={handleBack}
                  onSaveDraft={handleSaveDraft}
                />
              )}

              {currentStep === 3 && (
                <OtherInfoStep
                  formData={formData}
                  onUpdate={updateFormData}
                  onNext={handleNext}
                  onBack={handleBack}
                  onSaveDraft={handleSaveDraft}
                />
              )}

              {currentStep === 4 && (
                <PaymentStep
                  formData={formData}
                  onUpdate={updateFormData}
                  onNext={handleSubmit}
                  onBack={handleBack}
                  onSaveDraft={handleSaveDraft}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 1: Election Period
function ElectionPeriodStep({ formData, onUpdate, onNext, onBack, onSaveDraft }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Election Period</h2>

      <Input
        label="Requested Effective Date*"
        type="date"
        value={formData.requestedEffectiveDate}
        onChange={(e) => onUpdate({ requestedEffectiveDate: e.target.value })}
        required
      />

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-primary-600 dark:text-primary-400 mb-4">
            Initial Enrollment Period & other new to Medicare situations
          </h3>
          <div className="space-y-3">
            {[
              { value: 'initial-enrollment', label: "You're new to Medicare." },
              { value: 'part-b-recent', label: "You already have Hospital (Part A) and recently signed up for Medical (Part B). You want to join a Medicare Advantage Plan." },
              { value: 'notified-after-start', label: "You're new to Medicare, and You were notified about getting Medicare after your Part A and/or Part B coverage started." },
              { value: 'turning-65', label: "You had Medicare before, but You're now turning 65." },
            ].map((option) => (
              <label key={option.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="electionPeriod"
                  value={option.value}
                  checked={formData.electionPeriod === option.value}
                  onChange={(e) => onUpdate({ electionPeriod: e.target.value as ElectionPeriodType })}
                  className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span className="text-gray-700 dark:text-gray-300">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-primary-600 dark:text-primary-400 mb-4">
            Medicare Advantage Plan Open Enrollment Period
          </h3>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="electionPeriod"
              value="ma-open-enrollment"
              checked={formData.electionPeriod === 'ma-open-enrollment'}
              onChange={(e) => onUpdate({ electionPeriod: e.target.value as ElectionPeriodType })}
              className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
            />
            <span className="text-gray-700 dark:text-gray-300">
              You're in a Medicare Advantage Plan and want to make a change.
            </span>
          </label>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-primary-600 dark:text-primary-400 mb-2">
            Special Enrollment Period
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            YOU CHANGE WHERE YOU LIVE
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Generally, you have from 1 month before you move to 2 months after you move to join a plan.
          </p>
          <div className="space-y-3">
            {[
              { value: 'moved-outside-area', label: "You moved to a new address that's outside your current plan's service area, or You recently moved and this plan is a new option for you." },
              { value: 'moved-back-us', label: "You moved back to the U.S. after living outside the country." },
            ].map((option) => (
              <label key={option.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="electionPeriod"
                  value={option.value}
                  checked={formData.electionPeriod === option.value}
                  onChange={(e) => onUpdate({ electionPeriod: e.target.value as ElectionPeriodType })}
                  className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span className="text-gray-700 dark:text-gray-300">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button variant="outline" onClick={onSaveDraft} leftIcon={<Save className="w-4 h-4" />}>
          Save As Draft
        </Button>
        <Button onClick={onNext}>
          Next
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// Step 2: Contact Info
function ContactInfoStep({ formData, onUpdate, onNext, onBack, onSaveDraft }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Personal Information</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="First Name*"
          value={formData.firstName}
          onChange={(e) => onUpdate({ firstName: e.target.value })}
          required
        />
        <Input
          label="Middle Initials"
          value={formData.middleInitials}
          onChange={(e) => onUpdate({ middleInitials: e.target.value })}
        />
        <Input
          label="Last Name*"
          value={formData.lastName}
          onChange={(e) => onUpdate({ lastName: e.target.value })}
          required
        />
        <Input
          label="Date of Birth*"
          type="date"
          value={formData.dateOfBirth}
          onChange={(e) => onUpdate({ dateOfBirth: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Sex*
        </label>
        <div className="flex gap-4">
          {['Male', 'Female'].map((sex) => (
            <label key={sex} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="sex"
                value={sex}
                checked={formData.sex === sex}
                onChange={(e) => onUpdate({ sex: e.target.value as 'Male' | 'Female' })}
                className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              <span className="text-gray-700 dark:text-gray-300">{sex}</span>
            </label>
          ))}
        </div>
      </div>

      <Input
        label="Primary Phone No"
        type="tel"
        value={formData.primaryPhone}
        onChange={(e) => onUpdate({ primaryPhone: e.target.value })}
        helperText="Please enter your 10 digit phone number with no hyphen or spaces ex: (9999999999)"
        rightIcon={<Phone className="w-4 h-4 text-gray-400" />}
      />

      <Input
        label="Email"
        type="email"
        value={formData.email}
        onChange={(e) => onUpdate({ email: e.target.value })}
        helperText="Providing an email address authorizes us to contact you via email. Your email address will be handled consistent with our Privacy Policy which you can find on our website at https://www.aetna.com/medicare.html?cid=site_medicare and you can opt out anytime.*"
        rightIcon={<Mail className="w-4 h-4 text-gray-400" />}
      />

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button variant="outline" onClick={onSaveDraft} leftIcon={<Save className="w-4 h-4" />}>
          Save As Draft
        </Button>
        <Button onClick={onNext}>
          Next
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// Step 3: Other Info
function OtherInfoStep({ formData, onUpdate, onNext, onBack, onSaveDraft }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Other Information</h2>

      <div>
        <h3 className="text-lg font-semibold text-primary-600 dark:text-primary-400 mb-4">
          Medicaid Enrollment
        </h3>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Are you enrolled in your state Medicaid program?*
        </label>
        <div className="flex gap-4">
          {['Yes', 'No'].map((option) => (
            <label key={option} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="medicaidEnrolled"
                value={option}
                checked={formData.medicaidEnrolled === (option === 'Yes')}
                onChange={(e) => onUpdate({ medicaidEnrolled: e.target.value === 'Yes' })}
                className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              <span className="text-gray-700 dark:text-gray-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-primary-600 dark:text-primary-400 mb-4">
          Aetna Medicare Member
        </h3>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Are you a current or past Aetna Medicare member?
        </label>
        <div className="flex gap-4">
          {['Yes', 'No'].map((option) => (
            <label key={option} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="aetnaMember"
                value={option}
                checked={formData.aetnaMember === (option === 'Yes')}
                onChange={(e) => onUpdate({ aetnaMember: e.target.value === 'Yes' })}
                className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
              />
              <span className="text-gray-700 dark:text-gray-300">{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-primary-600 dark:text-primary-400 mb-4">
          Other Language or Format
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Preferred language*"
            options={[
              { value: 'English', label: 'English' },
              { value: 'Spanish', label: 'Spanish' },
              { value: 'Chinese', label: 'Chinese' },
            ]}
            value={formData.preferredLanguage}
            onChange={(e) => onUpdate({ preferredLanguage: e.target.value })}
          />
          <Select
            label="Preferred Written language*"
            options={[
              { value: 'English', label: 'English' },
              { value: 'Spanish', label: 'Spanish' },
              { value: 'Chinese', label: 'Chinese' },
            ]}
            value={formData.preferredWrittenLanguage}
            onChange={(e) => onUpdate({ preferredWrittenLanguage: e.target.value })}
          />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          Select one if you want us to send you information in an accessible format:
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button variant="outline" onClick={onSaveDraft} leftIcon={<Save className="w-4 h-4" />}>
          Save As Draft
        </Button>
        <Button onClick={onNext}>
          Next
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// Step 4: Payment (Release of Information)
function PaymentStep({ formData, onUpdate, onNext, onBack, onSaveDraft }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Release of Information</h2>

      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 text-sm text-gray-700 dark:text-gray-300 space-y-3">
        <p>
          I acknowledge that Aetna Medicare Advantage will release information for treatment, payment, and health care operations, including prescription drug event data, to Medicare.
        </p>
        <p>
          I acknowledge that information may be released for research purposes under federal statutes.
        </p>
        <p>
          I certify that the information on this enrollment form is correct to the best of my knowledge. I understand that intentionally providing false information will result in disenrollment.
        </p>
        <p>
          By signing (or having an authorized person sign), I certify that I have read and understand the contents of this application. If signed by an authorized individual, I certify that I am authorized to act on behalf of the enrollee under State law and that documentation is available upon request.
        </p>
        <p>
          Aetna Medicare is a PDP, HMO, PPO plan with a Medicare contract. SNPs have contracts with state Medicaid programs. Enrollment depends on contract renewal.
        </p>
        <p>
          This is not a complete description of benefits. A complete description of benefits, exclusions, limitations, and conditions of coverage is available.
        </p>
        <p>
          Plan features, availability, limitations, copayments, and restrictions may vary and change on January 1st of each year.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Please select the statement below that best describes your relationship to the person with Medicare listed on this enrollment form *
        </label>
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="relationship"
              value="self"
              checked={formData.relationshipToEnrollee === 'self'}
              onChange={(e) => onUpdate({ relationshipToEnrollee: e.target.value as RelationshipType })}
              className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
            />
            <span className="text-gray-700 dark:text-gray-300">
              I am the person listed on this enrollment form.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="relationship"
              value="authorized-representative"
              checked={formData.relationshipToEnrollee === 'authorized-representative'}
              onChange={(e) => onUpdate({ relationshipToEnrollee: e.target.value as RelationshipType })}
              className="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
            />
            <span className="text-gray-700 dark:text-gray-300">
              I am the person authorized to act on behalf of the individual listed on this enrollment form under the laws of the state where the individual resides.
            </span>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Assist Name*"
            value={formData.assistName}
            onChange={(e) => onUpdate({ assistName: e.target.value })}
            required
          />
          <Select
            label="Assist Relationship to Enrollee*"
            options={[
              { value: 'Self', label: 'Self' },
              { value: 'Spouse', label: 'Spouse' },
              { value: 'Child', label: 'Child' },
              { value: 'Parent', label: 'Parent' },
              { value: 'Other', label: 'Other' },
            ]}
            value={formData.assistRelationship}
            onChange={(e) => onUpdate({ assistRelationship: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button variant="outline" onClick={onSaveDraft} leftIcon={<Save className="w-4 h-4" />}>
          Save As Draft
        </Button>
        <Button onClick={onNext}>
          Review
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

