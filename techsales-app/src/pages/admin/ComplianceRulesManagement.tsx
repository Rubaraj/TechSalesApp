/**
 * Admin › Compliance Rules — supervisor-editable rules for the live-call
 * compliance scanner (cloned from RoleManagement's table+modal pattern).
 * Phrases are matched whole-word case-insensitive; the optional regex field
 * is for power users (validated server-side). Edits apply to the next call
 * (the scanner's rule cache is invalidated on every mutation).
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, ShieldAlert, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Input, Badge, Modal, ConfirmModal } from '../../components/common';
import { Table } from '../../components/common/Table';
import { useAuth } from '../../context/AuthContext';
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  type ComplianceRule,
  type ComplianceSeverity,
} from '../../services/complianceRuleService';

const SEVERITY_BADGE: Record<ComplianceSeverity, 'info' | 'warning' | 'danger'> = {
  info: 'info',
  warn: 'warning',
  critical: 'danger',
};

interface FormState {
  name: string;
  ruleText: string;
  suggestion: string;
  phrasesText: string;
  regex: string;
  severity: ComplianceSeverity;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  ruleText: '',
  suggestion: '',
  phrasesText: '',
  regex: '',
  severity: 'warn',
  isActive: true,
};

export function ComplianceRulesManagement() {
  const { user } = useAuth();
  const userId = user?.userId ?? '';

  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const loadRules = useCallback(async () => {
    if (!userId) return;
    try {
      setRules(await listRules(userId));
    } catch {
      setRules([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const filteredRules = rules.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.ruleText.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.phrases.some((p) => p.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const handleOpenModal = (rule?: ComplianceRule) => {
    if (rule) {
      setSelectedRule(rule);
      setFormData({
        name: rule.name,
        ruleText: rule.ruleText,
        suggestion: rule.suggestion,
        phrasesText: rule.phrases.join(', '),
        regex: rule.regex ?? '',
        severity: rule.severity,
        isActive: rule.isActive,
      });
      setShowAdvanced(!!rule.regex);
    } else {
      setSelectedRule(null);
      setFormData(EMPTY_FORM);
      setShowAdvanced(false);
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRule(null);
    setError('');
  };

  const handleSubmit = async () => {
    const phrases = formData.phrasesText
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (!formData.name.trim()) return setError('Rule name is required');
    if (!formData.ruleText.trim()) return setError('Rule text is required');
    if (!formData.suggestion.trim()) return setError('Suggestion is required');
    if (phrases.length === 0 && !formData.regex.trim()) {
      return setError('Provide at least one phrase or an advanced regex');
    }

    setIsSubmitting(true);
    setError('');
    const payload = {
      name: formData.name.trim(),
      ruleText: formData.ruleText.trim(),
      suggestion: formData.suggestion.trim(),
      phrases,
      regex: formData.regex.trim() || undefined,
      severity: formData.severity,
      isActive: formData.isActive,
    };
    try {
      const result = selectedRule
        ? await updateRule(userId, selectedRule.ruleId, payload)
        : await createRule(userId, payload);
      if (!result.rule) {
        setError(result.error ?? 'Save failed');
        return;
      }
      handleCloseModal();
      loadRules();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (rule: ComplianceRule) => {
    const result = await updateRule(userId, rule.ruleId, { isActive: !rule.isActive });
    if (result.rule) loadRules();
  };

  const handleConfirmDelete = async () => {
    if (!selectedRule) return;
    setIsSubmitting(true);
    const result = await deleteRule(userId, selectedRule.ruleId);
    setIsSubmitting(false);
    if (result.ok) {
      setIsDeleteModalOpen(false);
      setSelectedRule(null);
      loadRules();
    } else {
      setError(result.error ?? 'Failed to delete rule');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Rule',
      render: (rule: ComplianceRule) => (
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-600" />
          <div>
            <span className="font-medium">{rule.name}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md truncate">
              {rule.ruleText}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'phrases',
      header: 'Matches',
      render: (rule: ComplianceRule) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {rule.phrases.length > 0 && `${rule.phrases.length} phrase${rule.phrases.length > 1 ? 's' : ''}`}
          {rule.phrases.length > 0 && rule.regex && ' + '}
          {rule.regex && 'regex'}
        </span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (rule: ComplianceRule) => (
        <Badge variant={SEVERITY_BADGE[rule.severity] ?? 'info'}>{rule.severity}</Badge>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (rule: ComplianceRule) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleActive(rule);
          }}
          title={rule.isActive ? 'Click to disable' : 'Click to enable'}
        >
          <Badge variant={rule.isActive ? 'success' : 'danger'}>
            {rule.isActive ? 'Active' : 'Disabled'}
          </Badge>
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '100px',
      render: (rule: ComplianceRule) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenModal(rule);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Edit"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRule(rule);
              setIsDeleteModalOpen(true);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        These rules drive the live-call compliance scanner. Phrases match whole words,
        case-insensitive. Changes apply to the next call.
      </p>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search rules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4" />
          Add Rule
        </Button>
      </div>

      {/* Table */}
      <Table
        data={filteredRules}
        columns={columns}
        keyField="ruleId"
        isLoading={isLoading}
        emptyMessage="No compliance rules yet — the defaults seed on first call."
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedRule ? 'Edit Compliance Rule' : 'Add Compliance Rule'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              {selectedRule ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Rule Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder='e.g. Guarantees'
              required
            />
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Severity
                </label>
                <select
                  value={formData.severity}
                  onChange={(e) =>
                    setFormData({ ...formData, severity: e.target.value as ComplianceSeverity })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="info">info</option>
                  <option value="warn">warn</option>
                  <option value="critical">critical</option>
                </select>
              </div>
              <label className="flex items-center gap-2 pb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
              </label>
            </div>
          </div>

          <Input
            label="Rule (shown to the agent when it fires)"
            value={formData.ruleText}
            onChange={(e) => setFormData({ ...formData, ruleText: e.target.value })}
            placeholder="Cannot guarantee benefits or outcomes."
            required
          />
          <Input
            label="Suggested rephrase"
            value={formData.suggestion}
            onChange={(e) => setFormData({ ...formData, suggestion: e.target.value })}
            placeholder='Say "this plan includes…" instead of "guaranteed."'
            required
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phrases (comma-separated, matched whole-word, case-insensitive)
            </label>
            <textarea
              value={formData.phrasesText}
              onChange={(e) => setFormData({ ...formData, phrasesText: e.target.value })}
              rows={2}
              placeholder="guarantee, guaranteed, guarantees"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              {showAdvanced ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              Advanced: regular expression
            </button>
            {showAdvanced && (
              <input
                type="text"
                value={formData.regex}
                onChange={(e) => setFormData({ ...formData, regex: e.target.value })}
                placeholder="\bbetter than (?:original )?medicare\b"
                className="mt-2 w-full px-3 py-2 font-mono text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedRule(null);
          setError('');
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Compliance Rule"
        message={`Are you sure you want to delete "${selectedRule?.name}"? Calls will no longer be scanned for it. This cannot be undone.`}
        confirmText="Delete"
        isLoading={isSubmitting}
      />
    </div>
  );
}
