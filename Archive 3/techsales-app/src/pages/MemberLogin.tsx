import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogIn, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { DatePicker } from '../components/common/DatePicker';
import { useTheme } from '../context/ThemeContext';
import { getLogoByTheme } from '../utils/logoUtils';

export function MemberLogin() {
  const location = useLocation();
  const [policyNumber, setPolicyNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { memberLogin } = useAuth();
  const navigate = useNavigate();
  const { colorTheme } = useTheme();

  // Prefill data if coming from main login page
  useEffect(() => {
    if (location.state) {
      const { policyNumber: prefilledPolicy, dateOfBirth: prefilledDOB } = location.state as {
        policyNumber?: string;
        dateOfBirth?: string;
      };
      
      if (prefilledPolicy) {
        setPolicyNumber(prefilledPolicy);
      }
      if (prefilledDOB) {
        setDateOfBirth(prefilledDOB);
      }
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Validate DOB format (YYYY-MM-DD)
      const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dobRegex.test(dateOfBirth)) {
        setError('Please enter date of birth in YYYY-MM-DD format');
        setIsLoading(false);
        return;
      }

      const success = await memberLogin(policyNumber.trim(), dateOfBirth);
      
      if (success) {
        navigate('/member/dashboard');
      } else {
        setError('Invalid policy number or date of birth. Please try again.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
      {/* Login Card */}
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img 
            src={getLogoByTheme(colorTheme)} 
            alt={colorTheme === 'aetna' ? 'Aetna' : colorTheme === 'humana' ? 'Humana' : 'Medicare Hub'}
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Member Portal
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Access your plan information
          </p>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
          {/* Back button */}
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin/Agent Login
          </Link>

          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
            Sign in with your policy information
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Policy Number"
              type="text"
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
              placeholder="Enter your policy number"
              required
              autoFocus
            />

            <DatePicker
              label="Date of Birth"
              value={dateOfBirth}
              onChange={(date) => setDateOfBirth(date)}
              placeholder="Select your date of birth"
              required
              maxDate={new Date().toISOString().split('T')[0]}
            />

            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={isLoading}
              leftIcon={<LogIn className="w-5 h-5" />}
            >
              Sign In
            </Button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Demo Credentials:
            </p>
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <p>
                <span className="font-mono bg-gray-200 dark:bg-gray-600 px-1 rounded">POL-2025-001</span> - 
                DOB: <span className="font-mono bg-gray-200 dark:bg-gray-600 px-1 rounded">1955-03-15</span> (Aetna)
              </p>
              <p>
                <span className="font-mono bg-gray-200 dark:bg-gray-600 px-1 rounded">POL-2025-002</span> - 
                DOB: <span className="font-mono bg-gray-200 dark:bg-gray-600 px-1 rounded">1948-07-22</span> (Humana)
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Need help? Contact your agent or call 1-800-MEDICARE
          </p>
        </div>
      </div>
    </div>
  );
}
