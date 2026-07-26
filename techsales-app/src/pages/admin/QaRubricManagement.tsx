/**
 * Admin › QA Rubric — supervisor-editable scoring dimensions + required
 * disclosure checklist for the post-call QA review (cloned from the
 * CoachingRulesManagement table+modal pattern; two sections fed by one
 * GET). Dimension keys are immutable slugs generated at create; editing a
 * label never changes the key, so old reviews keep their snapshots.
 * Edits apply to the next QA review (rubric cache invalidated on every
 * mutation).
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, ClipboardCheck, ListChecks } from 'lucide-react';
import { Button, Input, Badge, Modal, ConfirmModal } from '../../components/common';
import { Table } from '../../components/common/Table';
import { useAuth } from '../../context/AuthContext';
import {
  listQaRubricItems,
  createQaRubricItem,
  updateQaRubricItem,
  deleteQaRubricItem,
  type QaRubricItem,
  type QaRubricItemKind,
} from '../../services/qaRubricService';

interface FormState {
  kind: QaRubricItemKind;
  label: string;
  description: string;
  weight: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  kind: 'dimension',
  label: '',
  description: '',
  weight: '3',
  sortOrder: '0',
  isActive: true,
};

const numberInputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500';

export function QaRubricManagement() {
  const { user } = useAuth();
  const userId = user?.userId ?? '';

  const [items, setItems] = useState<QaRubricItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QaRubricItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const loadItems = useCallback(async () => {
    if (!userId) return;
    try {
      setItems(await listQaRubricItems(userId));
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const dimensions = items.filter((i) => i.kind === 'dimension');
  const disclosures = items.filter((i) => i.kind === 'disclosure');

  const handleOpenModal = (kind: QaRubricItemKind, item?: QaRubricItem) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
        kind: item.kind,
        label: item.label,
        description: item.description ?? '',
        weight: String(item.weight ?? 3),
        sortOrder: String(item.sortOrder ?? 0),
        isActive: item.isActive,
      });
    } else {
      setSelectedItem(null);
      setFormData({ ...EMPTY_FORM, kind });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedItem(null);
    setError('');
  };

  const handleSubmit = async () => {
    if (!formData.label.trim()) {
      return setError(formData.kind === 'dimension' ? 'Dimension name is required' : 'Checklist text is required');
    }
    setIsSubmitting(true);
    setError('');
    const base = {
      label: formData.label.trim(),
      sortOrder: Number(formData.sortOrder) || 0,
      isActive: formData.isActive,
      ...(formData.kind === 'dimension'
        ? {
            description: formData.description.trim(),
            weight: Number(formData.weight) || 3,
          }
        : {}),
    };
    try {
      const result = selectedItem
        ? await updateQaRubricItem(userId, selectedItem.itemId, base)
        : await createQaRubricItem(userId, { kind: formData.kind, ...base });
      if (!result.item) {
        setError(result.error ?? 'Save failed');
        return;
      }
      handleCloseModal();
      loadItems();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (item: QaRubricItem) => {
    const result = await updateQaRubricItem(userId, item.itemId, { isActive: !item.isActive });
    if (result.item) loadItems();
  };

  const handleConfirmDelete = async () => {
    if (!selectedItem) return;
    setIsSubmitting(true);
    const result = await deleteQaRubricItem(userId, selectedItem.itemId);
    setIsSubmitting(false);
    if (result.ok) {
      setIsDeleteModalOpen(false);
      setSelectedItem(null);
      loadItems();
    } else {
      setError(result.error ?? 'Failed to delete item');
    }
  };

  const actionButtons = (item: QaRubricItem) => (
    <div className="flex items-center gap-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleOpenModal(item.kind, item);
        }}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Edit"
      >
        <Edit2 className="w-4 h-4 text-blue-600" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSelectedItem(item);
          setIsDeleteModalOpen(true);
        }}
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Delete"
      >
        <Trash2 className="w-4 h-4 text-red-600" />
      </button>
    </div>
  );

  const statusBadge = (item: QaRubricItem) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleToggleActive(item);
      }}
      title={item.isActive ? 'Click to disable' : 'Click to enable'}
    >
      <Badge variant={item.isActive ? 'success' : 'danger'}>
        {item.isActive ? 'Active' : 'Disabled'}
      </Badge>
    </button>
  );

  const dimensionColumns = [
    {
      key: 'label',
      header: 'Dimension',
      render: (item: QaRubricItem) => (
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-emerald-600" />
          <div>
            <span className="font-medium">{item.label}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md truncate">
              {item.description || item.key}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'weight',
      header: 'Weight',
      width: '90px',
      render: (item: QaRubricItem) => (
        <Badge variant={(item.weight ?? 3) >= 5 ? 'warning' : 'info'}>{item.weight ?? 3}/5</Badge>
      ),
    },
    {
      key: 'sortOrder',
      header: 'Order',
      width: '70px',
      render: (item: QaRubricItem) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{item.sortOrder}</span>
      ),
    },
    { key: 'isActive', header: 'Status', render: statusBadge },
    { key: 'actions', header: 'Actions', width: '100px', render: actionButtons },
  ];

  const disclosureColumns = [
    {
      key: 'label',
      header: 'Checklist item',
      render: (item: QaRubricItem) => (
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-blue-600" />
          <span className="font-medium">{item.label}</span>
        </div>
      ),
    },
    {
      key: 'sortOrder',
      header: 'Order',
      width: '70px',
      render: (item: QaRubricItem) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{item.sortOrder}</span>
      ),
    },
    { key: 'isActive', header: 'Status', render: statusBadge },
    { key: 'actions', header: 'Actions', width: '100px', render: actionButtons },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        This rubric drives the post-call QA review — the AI scores each call against these
        dimensions and checks each disclosure item. Changes apply to the next review; existing
        scorecards keep the labels they were scored with.
      </p>

      {/* Scoring dimensions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Scoring dimensions
          </h2>
          <Button onClick={() => handleOpenModal('dimension')}>
            <Plus className="w-4 h-4" />
            Add Dimension
          </Button>
        </div>
        <Table
          data={dimensions}
          columns={dimensionColumns}
          keyField="itemId"
          isLoading={isLoading}
          emptyMessage="No dimensions yet — the defaults seed on first load."
        />
      </div>

      {/* Disclosure checklist */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Disclosure checklist
          </h2>
          <Button onClick={() => handleOpenModal('disclosure')}>
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
        <Table
          data={disclosures}
          columns={disclosureColumns}
          keyField="itemId"
          isLoading={isLoading}
          emptyMessage="No disclosure items — the review returns an empty checklist."
        />
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={
          selectedItem
            ? `Edit ${formData.kind === 'dimension' ? 'Dimension' : 'Checklist Item'}`
            : `Add ${formData.kind === 'dimension' ? 'Dimension' : 'Checklist Item'}`
        }
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              {selectedItem ? 'Update' : 'Create'}
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
          <Input
            label={formData.kind === 'dimension' ? 'Dimension name' : 'Checklist item text'}
            value={formData.label}
            onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            placeholder={
              formData.kind === 'dimension'
                ? 'e.g. Objection handling'
                : 'e.g. Agent disclosed the recording of the call'
            }
            required
          />
          {formData.kind === 'dimension' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  What should the reviewer judge?
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Did the agent acknowledge concerns and respond with facts rather than pressure?"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              {selectedItem?.key && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Internal key: <code>{selectedItem.key}</code> (fixed at creation)
                </p>
              )}
            </>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {formData.kind === 'dimension' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Weight (1-5, 5 = heaviest)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  className={numberInputClass}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display order
              </label>
              <input
                type="number"
                min={0}
                max={999}
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                className={numberInputClass}
              />
            </div>
            <label className="flex items-center gap-2 pt-6 cursor-pointer">
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
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedItem(null);
          setError('');
        }}
        onConfirm={handleConfirmDelete}
        title={`Delete ${selectedItem?.kind === 'dimension' ? 'Dimension' : 'Checklist Item'}`}
        message={`Are you sure you want to delete "${selectedItem?.label}"? Future QA reviews will no longer include it. Existing scorecards are unaffected. This cannot be undone.`}
        confirmText="Delete"
        isLoading={isSubmitting}
      />
    </div>
  );
}
