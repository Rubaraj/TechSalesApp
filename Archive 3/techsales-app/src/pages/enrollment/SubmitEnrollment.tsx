import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, Download, Info } from 'lucide-react';
import { Button, Input, Modal } from '../../components/common';
import { createEnrollment } from '../../services/enrollmentService';
import { useAuth } from '../../context/AuthContext';
import type { EnrollmentFormData } from '../../types/enrollmentForm';

export function SubmitEnrollment() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { formData, planId, leadId, year } = location.state || {};

  const [agentSignature, setAgentSignature] = useState(formData?.agentSignature || '');
  const [beneficiarySignature, setBeneficiarySignature] = useState(formData?.beneficiarySignature || '');
  const [allowEmailContact, setAllowEmailContact] = useState(formData?.allowEmailContact || false);
  const [scopeOfAppointment, setScopeOfAppointment] = useState(formData?.scopeOfAppointment || false);
  const [disclaimer, setDisclaimer] = useState(formData?.disclaimer || false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');

  if (!formData || !planId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">No enrollment data found</p>
          <Button onClick={() => navigate('/enroll/select-plan')} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!agentSignature || !beneficiarySignature || !disclaimer) {
      alert('Please fill in all required fields and accept the disclaimer.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create enrollment record
      const enrollmentResult = await createEnrollment({
        leadId: leadId || '',
        planId,
        agentId: user?.userId || '',
        enrollmentDate: new Date().toISOString().split('T')[0],
        effectiveDate: formData.requestedEffectiveDate,
        enrollmentType: 'New Enrollment',
        enrollmentPeriod: 'AEP',
        status: 'Submitted',
        premium: 0, // Will be calculated from plan
        medicaidEligible: formData.medicaidEnrolled || false,
        notes: `Enrollment submitted via web form. Agent: ${user?.firstName} ${user?.lastName}`,
      }, user?.userId || '');

      if (enrollmentResult.success && enrollmentResult.data) {
        // Generate confirmation number
        const confNum = `T${Date.now()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
        setConfirmationNumber(confNum);
        setShowSuccess(true);
      } else {
        alert('Failed to submit enrollment. Please try again.');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error submitting enrollment:', error);
      alert('An error occurred while submitting the enrollment.');
      setIsSubmitting(false);
    }
  };

  const handleDownload = () => {
    // TODO: Implement download functionality
    console.log('Downloading enrollment confirmation...');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Submit Enrollment</h1>

          <div className="space-y-6">
            {/* Consent Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xl font-semibold text-primary-600 dark:text-primary-400">Consent</h2>
                <Info className="w-5 h-5 text-gray-400" />
              </div>
              <div className="space-y-4">
                <Input
                  label="Agent Signature*"
                  value={agentSignature}
                  onChange={(e) => setAgentSignature(e.target.value)}
                  placeholder="Enter agent signature"
                  required
                />
                <Input
                  label="Beneficiary Signature*"
                  value={beneficiarySignature}
                  onChange={(e) => setBeneficiarySignature(e.target.value)}
                  placeholder="Enter beneficiary signature"
                  required
                />
              </div>
            </div>

            {/* Allow Email Contact */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowEmailContact}
                  onChange={(e) => setAllowEmailContact(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-gray-700 dark:text-gray-300">Allow Email Contact</span>
                <Info className="w-4 h-4 text-gray-400" />
              </label>
            </div>

            {/* Scope of Appointment */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={scopeOfAppointment}
                  onChange={(e) => setScopeOfAppointment(e.target.checked)}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-gray-700 dark:text-gray-300">Scope of Appointment</span>
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400 ml-6">
                By checking this box, you attest that a Scope of Appointment exists for the beneficiary.
              </p>
            </div>

            {/* Disclaimer */}
            <div>
              <label className="flex items-start gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={disclaimer}
                  onChange={(e) => setDisclaimer(e.target.checked)}
                  className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  required
                />
                <span className="text-gray-700 dark:text-gray-300">Disclaimer*</span>
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400 ml-6">
                As required by CMS, this enrollment must be signed by the beneficiary, or person acting lawfully on behalf of the beneficiary as an authorized representative. By checking this box, you agree that the beneficiary, or authorized representative, has agreed to this enrollment and executing this electronic signature.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-center pt-6 border-t border-gray-200 dark:border-gray-700">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !agentSignature || !beneficiarySignature || !disclaimer}
                className="px-8"
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <Modal
        isOpen={showSuccess}
        onClose={() => {
          setShowSuccess(false);
          navigate('/sales');
        }}
        title=""
        size="sm"
      >
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Thank you!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Your enrollment is submitted successfully.
          </p>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Confirmation Number:</p>
            <p className="text-xl font-bold text-primary-600 dark:text-primary-400">
              {confirmationNumber}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => {
                setShowSuccess(false);
                navigate('/sales');
              }}
            >
              Close
            </Button>
            <Button
              onClick={handleDownload}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Download
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

