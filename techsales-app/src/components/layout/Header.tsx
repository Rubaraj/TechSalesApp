import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, LogOut, User, Bell, LayoutDashboard, ShoppingBag, Settings, Database, FileJson, Cpu, Sparkles } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getLogoByTheme } from '../../utils/logoUtils';

// Routes that should highlight the Sales tab
const SALES_ROUTES = [
  '/sales',
  '/leads',
  '/plans',
  '/pharmacies',
  '/drugs',
  '/providers',
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
  const { resolvedTheme, toggleTheme, colorTheme } = useTheme();
  const { user, logout, dataSource, aiEnabled, aiProvider } = useAuth();

  // Check if current path matches any sales routes
  const isSalesRoute = SALES_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  );

  const isInsightsActive = location.pathname === '/insights' || location.pathname === '/';
  const isSalesActive = isSalesRoute;
  const isAdminActive = location.pathname.startsWith('/admin');
  const isAdmin = user?.accessLevel === 'admin' || user?.isSuperAdmin;

  // Admin users see Insights and Admin tabs only
  // Non-admin users see Insights and Sales tabs
  const navItems = isAdmin
    ? [
        { path: '/insights', label: 'Insights', icon: LayoutDashboard, active: isInsightsActive && !isAdminActive },
        { path: '/admin', label: 'Admin', icon: Settings, active: isAdminActive },
      ]
    : [
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
              src={getLogoByTheme(colorTheme)} 
              alt={colorTheme === 'carrier1' ? 'Carrier 1' : colorTheme === 'carrier2' ? 'Carrier 2' : 'EXL'}
              className="h-8 w-auto"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                Medicare Hub
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
                      ? 'bg-primary-600 text-white shadow-sm'
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
            
            <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>

            {/* Data source badge — what's actually backing the data behind this session.
                MongoDB = green pill, JSON = amber pill (visual cue for the degraded path). */}
            {dataSource && (
              <span
                className={
                  dataSource === 'mongo'
                    ? 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                }
                title={
                  dataSource === 'mongo'
                    ? 'Data is being served from MongoDB (Pi)'
                    : 'Data is being served from JSON file store (backend or bundled fallback)'
                }
                aria-label={`Data source: ${dataSource === 'mongo' ? 'MongoDB' : 'JSON'}`}
              >
                {dataSource === 'mongo' ? (
                  <Database className="w-3.5 h-3.5" />
                ) : (
                  <FileJson className="w-3.5 h-3.5" />
                )}
                {dataSource === 'mongo' ? 'MongoDB' : 'JSON'}
              </span>
            )}

            {/* AI provider badge — Ollama (green, local & free) vs Claude
                (purple, cloud). Hidden when AI is disabled or the provider
                hasn't been probed (e.g. local-mode session). */}
            {aiEnabled && aiProvider && (
              <span
                className={
                  aiProvider === 'ollama'
                    ? 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                }
                title={
                  aiProvider === 'ollama'
                    ? 'AI responses are generated by Ollama (qwen2.5) running locally — free, no API key.'
                    : 'AI responses are generated by Anthropic Claude (cloud).'
                }
                aria-label={`AI provider: ${aiProvider === 'ollama' ? 'Ollama' : 'Claude'}`}
              >
                {aiProvider === 'ollama' ? (
                  <Cpu className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {aiProvider === 'ollama' ? 'AI: Ollama' : 'AI: Claude'}
              </span>
            )}

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
