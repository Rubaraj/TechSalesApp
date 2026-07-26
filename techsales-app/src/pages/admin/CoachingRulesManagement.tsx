/**
 * Admin › Coaching Rules — supervisor-editable rules for the proactive
 * coaching engine (cloned from ComplianceRulesManagement's table+modal
 * pattern). Each rule type has its own parameter fields; the tip is what the
 * agent sees in the Coach card when the rule fires. Edits apply to the next
 * call (the engine's rule cache is invalidated on every mutation).
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Lightbulb, Search } from 'lucide-react';
import { Button, Input, Badge, Modal, ConfirmModal } from '../../components/common';
import { Table } from '../../components/common/Table';
import { useAuth } from '../../context/AuthContext';
import {
  listCoachingRules,
  createCoachingRule,
  updateCoachingRule,
  deleteCoachingRule,
  type CoachingRule,
  type CoachingRuleType,
  type CoachingRuleParams,
  type DiscoveryItem,
} from '../../services/coachingRuleService';

const TYPE_LABEL: Record<CoachingRuleType, string> = {
  talk_ratio: 'Talk ratio',
  monologue: 'Monologue',
  missed_discovery: 'Missed discovery',
};

function paramSummary(rule: CoachingRule): string {
  const p = rule.params ?? {};
  switch (rule.type) {
    case 'talk_ratio':
      return `agent ≥ ${p.thresholdPct ?? 75}% after ${p.minCallSec ?? 60}s`;
    case 'monologue':
      return `${p.maxConsecutiveAgentUtterances ?? 6} agent lines in a row`;
    case 'missed_discovery':
      return `no ${p.item === 'medications' ? 'medications' : 'zip code'} by ${p.checkAfterSec ?? 120}s`;
  }
}

interface FormState {
  name: string;
  type: CoachingRuleType;
  tip: string;
  thresholdPct: string;
  minCallSec: string;
  maxConsecutiveAgentUtterances: string;
  item: DiscoveryItem;
  checkAfterSec: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'talk_ratio',
  tip: '',
  thresholdPct: '75',
  minCallSec: '60',
  maxConsecutiveAgentUtterances: '6',
  item: 'zip',
  checkAfterSec: '120',
  isActive: true,
};

function paramsFromForm(form: FormState): CoachingRuleParams {
  switch (form.type) {
    case 'talk_ratio':
      return {
        thresholdPct: Number(form.thresholdPct) || 75,
        minCallSec: Number(form.minCallSec) || 60,
      };
    case 'monologue':
      return {
        maxConsecutiveAgentUtterances: Number(form.maxConsecutiveAgentUtterances) || 6,
      };
    case 'missed_discovery':
      return {
        item: form.item,
        checkAfterSec: Number(form.checkAfterSec) || 120,
      };
  }
}

export function CoachingRulesManagement() {
  const { user } = useAuth();
  const userId = user?.userId ?? '';

  const [rules, setRules] = useState<CoachingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<CoachingRule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const loadRules = useCallback(async () => {
    if (!userId) return;
    try {
      setRules(await listCoachingRules(userId));
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
      r.tip.toLowerCase().includes(searchTerm.toLowerCase()) ||
      TYPE_LABEL[r.type].toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleOpenModal = (rule?: CoachingRule) => {
    if (rule) {
      setSelectedRule(rule);
      const p = rule.params ?? {};
      setFormData({
        name: rule.name,
        type: rule.type,
        tip: rule.tip,
        thresholdPct: String(p.thresholdPct ?? 75),
        minCallSec: String(p.minCallSec ?? 60),
        maxConsecutiveAgentUtterances: String(p.maxConsecutiveAgentUtterances ?? 6),
        item: p.item ?? 'zip',
        checkAfterSec: String(p.checkAfterSec ?? 120),
        isActive: rule.isActive,
      });
    } else {
      setSelectedRule(null);
      setFormData(EMPTY_FORM);
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
    if (!formData.name.trim()) return setError('Rule name is required');
    if (!formData.tip.trim()) return setError('Tip is required');

    setIsSubmitting(true);
    setError('');
    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      tip: formData.tip.trim(),
      params: paramsFromForm(formData),
      isActive: formData.isActive,
    };
    try {
      const result = selectedRule
        ? await updateCoachingRule(userId, selectedRule.ruleId, payload)
        : await createCoachingRule(userId, payload);
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

  const handleToggleActive = async (rule: CoachingRule) => {
    const result = await updateCoachingRule(userId, rule.ruleId, { isActive: !rule.isActive });
    if (result.rule) loadRules();
  };

  const handleConfirmDelete = async () => {
    if (!selectedRule) return;
    setIsSubmitting(true);
    const result = await deleteCoachingRule(userId, selectedRule.ruleId);
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
      render: (rule: CoachingRule) => (
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-violet-600" />
          <div>
            <span className="font-medium">{rule.name}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md truncate">
              {rule.tip}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Trigger',
      render: (rule: CoachingRule) => (
        <div>
          <Badge variant="info">{TYPE_LABEL[rule.type]}</Badge>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{paramSummary(rule)}</p>
        </div>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (rule: CoachingRule) => (
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
      render: (rule: CoachingRule) => (
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

  const numberInputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500';

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        These rules drive proactive coaching tips during live calls — pacing nudges and
        missed-discovery reminders that fire without waiting for a violation. Changes apply
        to the next call.
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
        emptyMessage="No coaching rules yet — the defaults seed on first call."
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedRule ? 'Edit Coaching Rule' : 'Add Coaching Rule'}
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
              placeholder="e.g. Talk-ratio imbalance"
              required
            />
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Trigger type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as CoachingRuleType })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="talk_ratio">Talk ratio — agent dominating the call</option>
                  <option value="monologue">Monologue — too many agent lines in a row</option>
                  <option value="missed_discovery">Missed discovery — key info not captured</option>
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

          {/* Type-specific parameters */}
          {formData.type === 'talk_ratio' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Agent talk share threshold (%)
                </label>
                <input
                  type="number"
                  min={50}
                  max={100}
                  value={formData.thresholdPct}
                  onChange={(e) => setFormData({ ...formData, thresholdPct: e.target.value })}
                  className={numberInputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Don't check before (seconds into call)
                </label>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={formData.minCallSec}
                  onChange={(e) => setFormData({ ...formData, minCallSec: e.target.value })}
                  className={numberInputClass}
                />
              </div>
            </div>
          )}
          {formData.type === 'monologue' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Max consecutive agent utterances before the nudge
              </label>
              <input
                type="number"
                min={2}
                max={50}
                value={formData.maxConsecutiveAgentUtterances}
                onChange={(e) =>
                  setFormData({ ...formData, maxConsecutiveAgentUtterances: e.target.value })
                }
                className={numberInputClass}
              />
            </div>
          )}
          {formData.type === 'missed_discovery' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Discovery item
                </label>
                <select
                  value={formData.item}
                  onChange={(e) =>
                    setFormData({ ...formData, item: e.target.value as DiscoveryItem })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="zip">Zip code</option>
                  <option value="medications">Medications</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Remind if still missing after (seconds)
                </label>
                <input
                  type="number"
                  min={30}
                  max={3600}
                  value={formData.checkAfterSec}
                  onChange={(e) => setFormData({ ...formData, checkAfterSec: e.target.value })}
                  className={numberInputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tip shown to the agent when it fires
            </label>
            <textarea
              value={formData.tip}
              onChange={(e) => setFormData({ ...formData, tip: e.target.value })}
              rows={2}
              placeholder="Pause and ask an open question to get them engaged."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
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
        title="Delete Coaching Rule"
        message={`Are you sure you want to delete "${selectedRule?.name}"? Agents will no longer get this nudge. This cannot be undone.`}
        confirmText="Delete"
        isLoading={isSubmitting}
      />
    </div>
  );
}
