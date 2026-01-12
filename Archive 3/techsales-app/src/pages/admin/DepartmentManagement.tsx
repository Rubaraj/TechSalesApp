import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Building2, Search } from 'lucide-react';
import { Button, Input, Badge, Modal, ConfirmModal } from '../../components/common';
import { Table } from '../../components/common/Table';
import { useAuth } from '../../context/AuthContext';
import type { Department } from '../../types';
import {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getUserCountByDepartment,
} from '../../services/userService';

interface DepartmentWithCount extends Department {
  userCount: number;
}

export function DepartmentManagement() {
  const { user: currentUser } = useAuth();
  const [departments, setDepartments] = useState<DepartmentWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDept, setSelectedDept] = useState<DepartmentWithCount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    departmentName: '',
    description: '',
    isActive: true,
  });

  // Load departments with user counts
  const loadDepartments = useCallback(async () => {
    setIsLoading(true);
    const result = await getAllDepartments();
    if (result.success && result.data) {
      const deptsWithCounts = await Promise.all(
        result.data.map(async (dept) => {
          const countResult = await getUserCountByDepartment(dept.departmentId);
          return {
            ...dept,
            userCount: countResult.success ? countResult.data || 0 : 0,
          };
        })
      );
      setDepartments(deptsWithCounts);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  // Filter departments
  const filteredDepts = departments.filter(
    (dept) =>
      dept.departmentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dept.description && dept.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Handle create/edit
  const handleOpenModal = (dept?: DepartmentWithCount) => {
    if (dept) {
      setSelectedDept(dept);
      setFormData({
        departmentName: dept.departmentName,
        description: dept.description || '',
        isActive: dept.isActive,
      });
    } else {
      setSelectedDept(null);
      setFormData({
        departmentName: '',
        description: '',
        isActive: true,
      });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedDept(null);
    setError('');
  };

  const handleSubmit = async () => {
    if (!formData.departmentName.trim()) {
      setError('Department name is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (selectedDept) {
        const result = await updateDepartment(selectedDept.departmentId, formData);
        if (!result.success) {
          setError(result.error || 'Failed to update department');
          return;
        }
      } else {
        const result = await createDepartment(formData, currentUser?.userId || '');
        if (!result.success) {
          setError(result.error || 'Failed to create department');
          return;
        }
      }
      handleCloseModal();
      loadDepartments();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDeleteClick = (dept: DepartmentWithCount) => {
    setSelectedDept(dept);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedDept) return;
    setIsSubmitting(true);
    const result = await deleteDepartment(selectedDept.departmentId);
    setIsSubmitting(false);

    if (result.success) {
      setIsDeleteModalOpen(false);
      setSelectedDept(null);
      loadDepartments();
    } else {
      setError(result.error || 'Failed to delete department');
    }
  };

  // Table columns
  const columns = [
    {
      key: 'departmentName',
      header: 'Department Name',
      render: (dept: DepartmentWithCount) => (
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-orange-600" />
          <span className="font-medium">{dept.departmentName}</span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (dept: DepartmentWithCount) => (
        <span className="text-gray-600 dark:text-gray-400">
          {dept.description || '-'}
        </span>
      ),
    },
    {
      key: 'userCount',
      header: 'Users',
      render: (dept: DepartmentWithCount) => (
        <Badge variant="info">{dept.userCount} users</Badge>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (dept: DepartmentWithCount) => (
        <Badge variant={dept.isActive ? 'success' : 'danger'}>
          {dept.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (dept: DepartmentWithCount) => (
        <span className="text-sm text-gray-500">
          {new Date(dept.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '100px',
      render: (dept: DepartmentWithCount) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenModal(dept);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Edit"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(dept);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Delete"
            disabled={dept.userCount > 0}
          >
            <Trash2 className={`w-4 h-4 ${dept.userCount > 0 ? 'text-gray-300' : 'text-red-600'}`} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search departments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4" />
          Add Department
        </Button>
      </div>

      {/* Table */}
      <Table
        data={filteredDepts}
        columns={columns}
        keyField="departmentId"
        isLoading={isLoading}
        emptyMessage="No departments found"
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedDept ? 'Edit Department' : 'Add New Department'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              {selectedDept ? 'Update' : 'Create'}
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
            label="Department Name"
            value={formData.departmentName}
            onChange={(e) => setFormData({ ...formData, departmentName: e.target.value })}
            required
          />
          <Input
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deptActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="deptActive" className="text-sm text-gray-700 dark:text-gray-300">
              Active Department
            </label>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedDept(null);
          setError('');
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Department"
        message={
          selectedDept?.userCount && selectedDept.userCount > 0
            ? `Cannot delete department "${selectedDept?.departmentName}" because it has ${selectedDept?.userCount} users assigned.`
            : `Are you sure you want to delete department "${selectedDept?.departmentName}"? This action cannot be undone.`
        }
        confirmText="Delete"
        isLoading={isSubmitting}
      />
    </div>
  );
}

