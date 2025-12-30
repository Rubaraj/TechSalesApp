import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';
import { Button } from '../components/common/Button';

export function ComingSoon() {
  const location = useLocation();
  const pageName = location.pathname.split('/')[1] || 'This page';
  const formattedName = pageName.charAt(0).toUpperCase() + pageName.slice(1);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-6">
        <Construction className="w-10 h-10 text-orange-600 dark:text-orange-400" />
      </div>
      
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        {formattedName} - Coming Soon
      </h1>
      
      <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
        We're working hard to bring you this feature. 
        Check back soon for updates!
      </p>
      
      <div className="flex gap-4">
        <Link to="/">
          <Button variant="outline" leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="mt-12 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl max-w-md">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
          Development Phases
        </h3>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 text-left">
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Phase 1: Project Setup ✓
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Phase 2: Core UI Framework ✓
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-500 rounded-full" />
            Phase 3: Admin Module
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full" />
            Phase 4: Lead Management
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full" />
            Phase 5+: More modules...
          </li>
        </ul>
      </div>
    </div>
  );
}

