import { useState, useEffect } from 'react';
import { Save, RefreshCw, Database, Globe, Bell, Lock, Palette, Trash2 } from 'lucide-react';
import { Button, Input, Select } from '../../components/common';
import { useTheme, type ColorTheme } from '../../context/ThemeContext';

interface SettingSection {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const settingSections: SettingSection[] = [
  { id: 'general', title: 'General', description: 'Basic application settings', icon: Globe },
  { id: 'appearance', title: 'Appearance', description: 'Theme and display settings', icon: Palette },
  { id: 'notifications', title: 'Notifications', description: 'Email and alert preferences', icon: Bell },
  { id: 'security', title: 'Security', description: 'Authentication and access control', icon: Lock },
  { id: 'data', title: 'Data Management', description: 'Export, import, and backup settings', icon: Database },
];

export function SystemSettings() {
  const { theme, toggleTheme, colorTheme, setColorTheme } = useTheme();
  const [activeSection, setActiveSection] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  
  // Preview state for color theme (only applies when saved)
  const [previewColorTheme, setPreviewColorTheme] = useState<ColorTheme>(colorTheme);

  // Sync preview with actual theme when it changes externally
  useEffect(() => {
    setPreviewColorTheme(colorTheme);
  }, [colorTheme]);

  // Form states
  const [generalSettings, setGeneralSettings] = useState({
    appName: 'Medicare Hub',
    contactEmail: 'support@exlservice.com',
    defaultMarket: 'All Markets',
    sessionTimeout: '30',
    itemsPerPage: '10',
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    leadAssignmentAlerts: true,
    enrollmentReminders: true,
    dailyDigest: false,
    weeklyReport: true,
  });

  const [securitySettings, setSecuritySettings] = useState({
    twoFactorAuth: false,
    passwordExpiry: '90',
    maxLoginAttempts: '5',
    sessionConcurrency: 'single',
  });

  const handleSave = async () => {
    setIsSaving(true);
    // Apply the preview color theme
    setColorTheme(previewColorTheme);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Application Name"
                value={generalSettings.appName}
                onChange={(e) => setGeneralSettings({ ...generalSettings, appName: e.target.value })}
              />
              <Input
                label="Contact Email"
                type="email"
                value={generalSettings.contactEmail}
                onChange={(e) => setGeneralSettings({ ...generalSettings, contactEmail: e.target.value })}
              />
              <Select
                label="Default Market"
                options={[
                  { value: 'All Markets', label: 'All Markets' },
                  { value: 'Northeast', label: 'Northeast' },
                  { value: 'Southeast', label: 'Southeast' },
                  { value: 'Midwest', label: 'Midwest' },
                  { value: 'Southwest', label: 'Southwest' },
                  { value: 'West', label: 'West' },
                ]}
                value={generalSettings.defaultMarket}
                onChange={(e) => setGeneralSettings({ ...generalSettings, defaultMarket: e.target.value })}
              />
              <Select
                label="Session Timeout (minutes)"
                options={[
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '60', label: '1 hour' },
                  { value: '120', label: '2 hours' },
                ]}
                value={generalSettings.sessionTimeout}
                onChange={(e) => setGeneralSettings({ ...generalSettings, sessionTimeout: e.target.value })}
              />
              <Select
                label="Items Per Page"
                options={[
                  { value: '10', label: '10' },
                  { value: '25', label: '25' },
                  { value: '50', label: '50' },
                  { value: '100', label: '100' },
                ]}
                value={generalSettings.itemsPerPage}
                onChange={(e) => setGeneralSettings({ ...generalSettings, itemsPerPage: e.target.value })}
              />
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Theme Mode</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Switch between light and dark mode
                </p>
              </div>
              <button
                onClick={toggleTheme}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${theme === 'dark' ? 'bg-primary-600' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setPreviewColorTheme('default')}
                className={`p-4 border-2 rounded-lg cursor-pointer bg-white transition-all ${
                  previewColorTheme === 'default' 
                    ? 'border-orange-500 shadow-lg scale-105' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="h-20 bg-gradient-to-br from-orange-500 to-orange-700 rounded mb-2" />
                <p className="text-center text-sm font-medium text-gray-900">Default Theme</p>
                {previewColorTheme === 'default' && (
                  <p className="text-center text-xs text-orange-600 mt-1 font-semibold">
                    {previewColorTheme !== colorTheme ? 'Selected' : 'Active'}
                  </p>
                )}
              </button>
              <button
                onClick={() => setPreviewColorTheme('carrier1')}
                className={`p-4 border-2 rounded-lg cursor-pointer bg-white transition-all ${
                  previewColorTheme === 'carrier1'
                    ? 'border-[#5a2e6f] shadow-lg scale-105'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="h-20 bg-gradient-to-br from-[#5a2e6f] to-[#482459] rounded mb-2" />
                <p className="text-center text-sm font-medium text-gray-900">Carrier 1 Theme</p>
                {previewColorTheme === 'carrier1' && (
                  <p className="text-center text-xs text-[#5a2e6f] mt-1 font-semibold">
                    {previewColorTheme !== colorTheme ? 'Selected' : 'Active'}
                  </p>
                )}
              </button>
              <button
                onClick={() => setPreviewColorTheme('carrier2')}
                className={`p-4 border-2 rounded-lg cursor-pointer bg-white transition-all ${
                  previewColorTheme === 'carrier2'
                    ? 'border-[#5c9a1b] shadow-lg scale-105'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="h-20 bg-gradient-to-br from-[#5c9a1b] to-[#4a7a16] rounded mb-2" />
                <p className="text-center text-sm font-medium text-gray-900">Carrier 2 Theme</p>
                {previewColorTheme === 'carrier2' && (
                  <p className="text-center text-xs text-[#5c9a1b] mt-1 font-semibold">
                    {previewColorTheme !== colorTheme ? 'Selected' : 'Active'}
                  </p>
                )}
              </button>
            </div>
            
            {previewColorTheme !== colorTheme && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Note:</strong> Theme selection will be applied when you click "Save Changes". 
                  Current active theme: <strong>{colorTheme === 'default' ? 'Default (Orange)' : colorTheme === 'carrier1' ? 'Carrier 1 (Purple)' : 'Carrier 2 (Green)'}</strong>
                </p>
              </div>
            )}
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-4">
            {[
              { key: 'emailNotifications', label: 'Email Notifications', desc: 'Receive email updates for important events' },
              { key: 'leadAssignmentAlerts', label: 'Lead Assignment Alerts', desc: 'Get notified when leads are assigned to you' },
              { key: 'enrollmentReminders', label: 'Enrollment Reminders', desc: 'Receive reminders for pending enrollments' },
              { key: 'dailyDigest', label: 'Daily Digest', desc: 'Get a daily summary of activities' },
              { key: 'weeklyReport', label: 'Weekly Report', desc: 'Receive weekly performance reports' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">{item.label}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</p>
                </div>
                <button
                  onClick={() => setNotificationSettings({
                    ...notificationSettings,
                    [item.key]: !notificationSettings[item.key as keyof typeof notificationSettings],
                  })}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${notificationSettings[item.key as keyof typeof notificationSettings] ? 'bg-primary-600' : 'bg-gray-300'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${notificationSettings[item.key as keyof typeof notificationSettings] ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>
            ))}
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Two-Factor Authentication</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Require 2FA for all user logins
                </p>
              </div>
              <button
                onClick={() => setSecuritySettings({ ...securitySettings, twoFactorAuth: !securitySettings.twoFactorAuth })}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${securitySettings.twoFactorAuth ? 'bg-primary-600' : 'bg-gray-300'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${securitySettings.twoFactorAuth ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Password Expiry (days)"
                options={[
                  { value: '30', label: '30 days' },
                  { value: '60', label: '60 days' },
                  { value: '90', label: '90 days' },
                  { value: '180', label: '180 days' },
                  { value: '365', label: '1 year' },
                ]}
                value={securitySettings.passwordExpiry}
                onChange={(e) => setSecuritySettings({ ...securitySettings, passwordExpiry: e.target.value })}
              />
              <Select
                label="Max Login Attempts"
                options={[
                  { value: '3', label: '3 attempts' },
                  { value: '5', label: '5 attempts' },
                  { value: '10', label: '10 attempts' },
                ]}
                value={securitySettings.maxLoginAttempts}
                onChange={(e) => setSecuritySettings({ ...securitySettings, maxLoginAttempts: e.target.value })}
              />
              <Select
                label="Session Concurrency"
                options={[
                  { value: 'single', label: 'Single Session Only' },
                  { value: 'multiple', label: 'Allow Multiple Sessions' },
                ]}
                value={securitySettings.sessionConcurrency}
                onChange={(e) => setSecuritySettings({ ...securitySettings, sessionConcurrency: e.target.value })}
              />
            </div>
          </div>
        );

      case 'data':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Export Data</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Download all application data as JSON files
                </p>
                <Button variant="outline">
                  <Database className="w-4 h-4" />
                  Export All Data
                </Button>
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Import Data</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Import data from JSON backup files
                </p>
                <Button variant="outline">
                  <Database className="w-4 h-4" />
                  Import Data
                </Button>
              </div>

              <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Reset Demo Data</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Reset all data to initial demo state
                </p>
                <Button variant="outline">
                  <RefreshCw className="w-4 h-4" />
                  Reset Data
                </Button>
              </div>

              <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <h4 className="font-medium text-red-700 dark:text-red-400 mb-2">Clear All Data</h4>
                <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                  Permanently delete all application data
                </p>
                <Button variant="danger">
                  <Trash2 className="w-4 h-4" />
                  Clear Data
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <div className="w-64 shrink-0">
        <nav className="space-y-1">
          {settingSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors
                ${activeSection === section.id
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              `}
            >
              <section.icon className="w-5 h-5" />
              <div>
                <div className="font-medium">{section.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {section.description}
                </div>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {settingSections.find((s) => s.id === activeSection)?.title} Settings
            </h3>
            <Button onClick={handleSave} isLoading={isSaving}>
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
          </div>

          {renderSectionContent()}
        </div>
      </div>
    </div>
  );
}

