import { NavLink, Outlet } from 'react-router-dom';
import { Users, Shield, Building2, Settings, Target, Radio, ShieldAlert, Lightbulb, ClipboardCheck, DollarSign, Drama } from 'lucide-react';

const adminNavItems = [
  { to: '/admin/users', icon: Users, label: 'User Management' },
  { to: '/admin/roles', icon: Shield, label: 'Role Management' },
  { to: '/admin/departments', icon: Building2, label: 'Departments' },
  { to: '/admin/targets', icon: Target, label: 'Target Management' },
  { to: '/admin/supervision', icon: Radio, label: 'Supervision' },
  { to: '/admin/compliance', icon: ShieldAlert, label: 'Compliance Rules' },
  { to: '/admin/coaching', icon: Lightbulb, label: 'Coaching Rules' },
  { to: '/admin/qa-rubric', icon: ClipboardCheck, label: 'QA Analytics' },
  { to: '/admin/ai-costs', icon: DollarSign, label: 'AI Cost Analysis' },
  { to: '/admin/personas', icon: Drama, label: 'Training Personas' },
  { to: '/admin/settings', icon: Settings, label: 'System Settings' },
];

export function AdminLayout() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Admin Panel
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage users, roles, departments, and system settings
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {adminNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `
              flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap
              ${isActive
                ? 'border-orange-600 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }
            `}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Content */}
      <Outlet />
    </div>
  );
}

