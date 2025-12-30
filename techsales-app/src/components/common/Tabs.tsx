import type { ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
}

export function Tabs({ tabs, activeTab, onChange, variant = 'default' }: TabsProps) {
  const getTabClasses = (isActive: boolean) => {
    const base = 'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all';
    
    switch (variant) {
      case 'pills':
        return `${base} rounded-lg ${
          isActive
            ? 'bg-orange-600 text-white'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`;
      case 'underline':
        return `${base} border-b-2 -mb-px ${
          isActive
            ? 'border-orange-600 text-orange-600 dark:text-orange-400'
            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
        }`;
      default:
        return `${base} rounded-t-lg border-b-2 ${
          isActive
            ? 'border-orange-600 bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400'
            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
        }`;
    }
  };

  return (
    <div className={`flex gap-1 ${variant === 'underline' ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={getTabClasses(activeTab === tab.id)}
        >
          {tab.icon && <tab.icon className="w-4 h-4" />}
          {tab.label}
          {tab.badge !== undefined && (
            <span className={`px-1.5 py-0.5 text-xs rounded-full ${
              activeTab === tab.id
                ? 'bg-white/20 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

interface TabPanelProps {
  children: ReactNode;
  isActive: boolean;
}

export function TabPanel({ children, isActive }: TabPanelProps) {
  if (!isActive) return null;
  return <div className="animate-in fade-in duration-200">{children}</div>;
}

