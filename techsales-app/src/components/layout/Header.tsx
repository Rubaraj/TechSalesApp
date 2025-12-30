import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, LogOut, User, Bell, LayoutDashboard, ShoppingBag } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

// Routes that should highlight the Sales tab
const SALES_ROUTES = [
  '/sales',
  '/leads',
  '/plans',
  '/pharmacies',
  '/drugs',
  '/pba',
  '/pbkit',
  '/state-assistance',
  '/plan-subsidy',
  '/recommendations',
  '/yoy',
  '/admin',
];

export function Header() {
  const location = useLocation();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  // Check if current path matches any sales routes
  const isSalesRoute = SALES_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  );

  const isInsightsActive = location.pathname === '/insights' || location.pathname === '/';
  const isSalesActive = isSalesRoute;

  const navItems = [
    { path: '/insights', label: 'Insights', icon: LayoutDashboard, active: isInsightsActive && !isSalesActive },
    { path: '/sales', label: 'Sales', icon: ShoppingBag, active: isSalesActive },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left side - Logo */}
        <div className="flex items-center gap-6">
          <Link to="/insights" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img 
              src="https://www.exlservice.com/themes/exl_service/exl_logo_rgb_orange_pos_94.png" 
              alt="EXL"
              className="h-8 w-auto"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Med Hub
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-0.5">
                Built for agents. Trusted by seniors
              </p>
            </div>
          </Link>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                    ${item.active
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          <button
            className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
          >
            {resolvedTheme === 'light' ? (
              <Moon className="w-5 h-5 text-gray-600" />
            ) : (
              <Sun className="w-5 h-5 text-yellow-400" />
            )}
          </button>

          {/* User menu */}
          <div className="flex items-center gap-3 pl-3 border-l border-gray-200 dark:border-gray-700">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {user?.accessLevel === 'admin' ? 'Administrator' : 'Sales Agent'}
              </p>
            </div>
            
            <div className="w-9 h-9 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>

            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
