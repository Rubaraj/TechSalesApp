import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Target as TargetIcon, Save } from 'lucide-react';
import { Button, Input, Select, Badge, Modal } from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import type { Target, TargetFormData, TargetMetric, TargetPeriod } from '../../types';
import {
  getAllTargets,
  createTarget,
  updateTarget,
  deleteTarget,
  toggleTargetStatus,
} from '../../services/targetService';

const metricOptions: { value: TargetMetric; label: string }[] = [
  { value: 'New Leads', label: 'New Leads' },
  { value: 'New Enrollments', label: 'New Enrollments' },
  { value: 'New Appointments', label: 'New Appointments' },
  { value: 'Electronic Kits Sent', label: 'Electronic Kits Sent' },
];

const periodOptions: { value: TargetPeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export function TargetManagement() {
  const { user: currentUser } = useAuth();
  const [targets, setTargets] = useState<Target[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<TargetFormData>({
    metric: 'New Leads',
    period: 'monthly',
    targetValue: 0,
    points: 0,
    isActive: true,
  });

  // Load targets
  const loadTargets = async () => {
    setIsLoading(true);
    const result = await getAllTargets();
    if (result.success && result.data) {
      setTargets(result.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTargets();
  }, []);

  // Reset form
  const resetForm = () => {
    setFormData({
      metric: 'New Leads',
      period: 'monthly',
      targetValue: 0,
      points: 0,
      isActive: true,
    });
    setSelectedTarget(null);
    setError('');
  };

  // Open modal for create
  const handleCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleEdit = (target: Target) => {
    setFormData({
      metric: target.metric,
      period: target.period,
      targetValue: target.targetValue,
      points: target.points,
      isActive: target.isActive,
    });
    setSelectedTarget(target);
    setIsModalOpen(true);
  };

  // Open delete modal
  const handleDeleteClick = (target: Target) => {
    setSelectedTarget(target);
    setIsDeleteModalOpen(true);
  };

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!currentUser?.userId) {
      setError('User not authenticated');
      setIsSubmitting(false);
      return;
    }

    try {
      let result;
      if (selectedTarget) {
        // Update existing target
        result = await updateTarget(
          selectedTarget.targetId,
          formData,
          currentUser.userId
        );
      } else {
        // Create new target
        result = await createTarget(formData, currentUser.userId);
      }

      if (result.success) {
        setIsModalOpen(false);
        resetForm();
        await loadTargets();
      } else {
        setError(result.error || 'Failed to save target');
      }
    } catch (err) {
      setError('An error occurred while saving the target');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedTarget) return;

    setIsSubmitting(true);
    const result = await deleteTarget(selectedTarget.targetId);
    
    if (result.success) {
      setIsDeleteModalOpen(false);
      setSelectedTarget(null);
      await loadTargets();
    } else {
      setError(result.error || 'Failed to delete target');
    }
    setIsSubmitting(false);
  };

  // Handle toggle status
  const handleToggleStatus = async (target: Target) => {
    if (!currentUser?.userId) return;

    const result = await toggleTargetStatus(target.targetId, currentUser.userId);
    if (result.success) {
      await loadTargets();
    }
  };

  // Filter targets by period (default to monthly)
  const [selectedPeriod, setSelectedPeriod] = useState<TargetPeriod | 'all'>('all');
  const filteredTargets = selectedPeriod === 'all' 
    ? targets 
    : targets.filter(t => t.period === selectedPeriod);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Target Management</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Set and manage targets and points for agent performance metrics
          </p>
        </div>
        <Button leftIcon={<Plus className="w-4 h-4" />} onClick={handleCreate}>
          Create Target
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select
          label="Period"
          options={[
            { value: 'all', label: 'All Periods' },
            ...periodOptions,
          ]}
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value as TargetPeriod | 'all')}
          className="w-48"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Targets Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading targets...</p>
          </div>
        ) : filteredTargets.length === 0 ? (
          <div className="p-12 text-center">
            <TargetIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No targets found</p>
            <Button className="mt-4" onClick={handleCreate}>
              Create First Target
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Metric
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Period
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Target Value
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Points
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTargets.map((target) => (
                  <tr
                    key={target.targetId}
                    className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="py-4 px-4">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {target.metric}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant="info">
                        {target.period}
                      </Badge>
                    </td>
                    <td className="py-4 px-4 text-right text-gray-900 dark:text-white">
                      {target.targetValue.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className="font-medium text-primary-600 dark:text-primary-400">
                        {target.points}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <button
                        onClick={() => handleToggleStatus(target)}
                        className="inline-flex items-center"
                        title={target.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {target.isActive ? (
                          <ToggleRight className="w-6 h-6 text-green-600 dark:text-green-400" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-gray-400" />
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(target)}
                          className="p-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(target)}
                          className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={selectedTarget ? 'Edit Target' : 'Create Target'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Metric"
            options={metricOptions}
            value={formData.metric}
            onChange={(e) => setFormData({ ...formData, metric: e.target.value as TargetMetric })}
            required
          />

          <Select
            label="Period"
            options={periodOptions}
            value={formData.period}
            onChange={(e) => setFormData({ ...formData, period: e.target.value as TargetPeriod })}
            required
          />

          <Input
            label="Target Value"
            type="number"
            value={formData.targetValue.toString()}
            onChange={(e) => setFormData({ ...formData, targetValue: parseInt(e.target.value) || 0 })}
            min="0"
            required
          />

          <Input
            label="Points"
            type="number"
            value={formData.points.toString()}
            onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
            min="0"
            required
            helperText="Points awarded for achieving this target"
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">
              Active
            </label>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" leftIcon={<Save className="w-4 h-4" />} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : selectedTarget ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedTarget(null);
        }}
        title="Delete Target"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete the target for{' '}
            <span className="font-semibold">{selectedTarget?.metric}</span> ({selectedTarget?.period})?
            This action cannot be undone.
          </p>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setSelectedTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

