import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Shield, Search } from 'lucide-react';
import { Button, Input, Badge, Modal, ConfirmModal } from '../../components/common';
import { Table } from '../../components/common/Table';
import type { Role } from '../../types';
import {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  getUserCountByRole,
} from '../../services/userService';

// Available permissions
const availablePermissions = [
  { key: 'leads.view', label: 'View Leads', category: 'Leads' },
  { key: 'leads.create', label: 'Create Leads', category: 'Leads' },
  { key: 'leads.edit', label: 'Edit Leads', category: 'Leads' },
  { key: 'leads.delete', label: 'Delete Leads', category: 'Leads' },
  { key: 'plans.view', label: 'View Plans', category: 'Plans' },
  { key: 'pharmacy.view', label: 'View Pharmacies', category: 'Pharmacy' },
  { key: 'pharmacy.tag', label: 'Tag Pharmacies', category: 'Pharmacy' },
  { key: 'drugs.view', label: 'View Drugs', category: 'Drugs' },
  { key: 'drugs.tag', label: 'Tag Drugs', category: 'Drugs' },
  { key: 'pba.view', label: 'View PBA', category: 'PBA' },
  { key: 'pba.manage', label: 'Manage PBA', category: 'PBA' },
  { key: 'pbkit.view', label: 'View PBKit', category: 'PBKit' },
  { key: 'pbkit.manage', label: 'Manage PBKit', category: 'PBKit' },
  { key: 'recommendations.view', label: 'View Recommendations', category: 'Recommendations' },
  { key: 'recommendations.generate', label: 'Generate Recommendations', category: 'Recommendations' },
  { key: 'admin.access', label: 'Access Admin Panel', category: 'Admin' },
  { key: 'admin.users', label: 'Manage Users', category: 'Admin' },
  { key: 'admin.roles', label: 'Manage Roles', category: 'Admin' },
];

interface RoleWithCount extends Role {
  userCount: number;
}

export function RoleManagement() {
  const [roles, setRoles] = useState<RoleWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleWithCount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    roleName: '',
    description: '',
    permissions: [] as string[],
    isActive: true,
  });

  // Load roles with user counts
  const loadRoles = useCallback(async () => {
    setIsLoading(true);
    const result = await getAllRoles();
    if (result.success && result.data) {
      const rolesWithCounts = await Promise.all(
        result.data.map(async (role) => {
          const countResult = await getUserCountByRole(role.roleId);
          return {
            ...role,
            userCount: countResult.success ? countResult.data || 0 : 0,
          };
        })
      );
      setRoles(rolesWithCounts);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // Filter roles
  const filteredRoles = roles.filter(
    (role) =>
      role.roleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle create/edit
  const handleOpenModal = (role?: RoleWithCount) => {
    if (role) {
      setSelectedRole(role);
      setFormData({
        roleName: role.roleName,
        description: role.description,
        permissions: role.permissions,
        isActive: role.isActive,
      });
    } else {
      setSelectedRole(null);
      setFormData({
        roleName: '',
        description: '',
        permissions: [],
        isActive: true,
      });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedRole(null);
    setError('');
  };

  const handleSubmit = async () => {
    if (!formData.roleName.trim()) {
      setError('Role name is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      if (selectedRole) {
        const result = await updateRole(selectedRole.roleId, formData);
        if (!result.success) {
          setError(result.error || 'Failed to update role');
          return;
        }
      } else {
        const result = await createRole(formData);
        if (!result.success) {
          setError(result.error || 'Failed to create role');
          return;
        }
      }
      handleCloseModal();
      loadRoles();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDeleteClick = (role: RoleWithCount) => {
    setSelectedRole(role);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedRole) return;
    setIsSubmitting(true);
    const result = await deleteRole(selectedRole.roleId);
    setIsSubmitting(false);

    if (result.success) {
      setIsDeleteModalOpen(false);
      setSelectedRole(null);
      loadRoles();
    } else {
      setError(result.error || 'Failed to delete role');
    }
  };

  // Toggle permission
  const togglePermission = (permission: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  // Toggle category
  const toggleCategory = (category: string) => {
    const categoryPermissions = availablePermissions
      .filter((p) => p.category === category)
      .map((p) => p.key);
    
    const allSelected = categoryPermissions.every((p) => formData.permissions.includes(p));
    
    setFormData((prev) => ({
      ...prev,
      permissions: allSelected
        ? prev.permissions.filter((p) => !categoryPermissions.includes(p))
        : [...new Set([...prev.permissions, ...categoryPermissions])],
    }));
  };

  // Group permissions by category
  const permissionsByCategory = availablePermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, typeof availablePermissions>);

  // Table columns
  const columns = [
    {
      key: 'roleName',
      header: 'Role Name',
      render: (role: RoleWithCount) => (
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-600" />
          <span className="font-medium">{role.roleName}</span>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
    },
    {
      key: 'permissions',
      header: 'Permissions',
      render: (role: RoleWithCount) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {role.permissions.length} permissions
        </span>
      ),
    },
    {
      key: 'userCount',
      header: 'Users',
      render: (role: RoleWithCount) => (
        <Badge variant="info">{role.userCount} users</Badge>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (role: RoleWithCount) => (
        <Badge variant={role.isActive ? 'success' : 'danger'}>
          {role.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '100px',
      render: (role: RoleWithCount) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenModal(role);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Edit"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(role);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Delete"
            disabled={role.userCount > 0}
          >
            <Trash2 className={`w-4 h-4 ${role.userCount > 0 ? 'text-gray-300' : 'text-red-600'}`} />
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
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4" />
          Add Role
        </Button>
      </div>

      {/* Table */}
      <Table
        data={filteredRoles}
        columns={columns}
        keyField="roleId"
        isLoading={isLoading}
        emptyMessage="No roles found"
      />

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedRole ? 'Edit Role' : 'Add New Role'}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              {selectedRole ? 'Update' : 'Create'}
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
              label="Role Name"
              value={formData.roleName}
              onChange={(e) => setFormData({ ...formData, roleName: e.target.value })}
              required
            />
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="roleActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <label htmlFor="roleActive" className="text-sm text-gray-700 dark:text-gray-300">
                Active Role
              </label>
            </div>
          </div>

          <Input
            label="Description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Permissions
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              {Object.entries(permissionsByCategory).map(([category, perms]) => {
                const categorySelected = perms.every((p) => formData.permissions.includes(p.key));
                const someSelected = perms.some((p) => formData.permissions.includes(p.key));

                return (
                  <div key={category} className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={categorySelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected && !categorySelected;
                        }}
                        onChange={() => toggleCategory(category)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="font-medium text-gray-900 dark:text-white">{category}</span>
                    </label>
                    <div className="pl-6 space-y-1">
                      {perms.map((perm) => (
                        <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.permissions.includes(perm.key)}
                            onChange={() => togglePermission(perm.key)}
                            className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedRole(null);
          setError('');
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Role"
        message={
          selectedRole?.userCount && selectedRole.userCount > 0
            ? `Cannot delete role "${selectedRole?.roleName}" because it has ${selectedRole?.userCount} users assigned.`
            : `Are you sure you want to delete role "${selectedRole?.roleName}"? This action cannot be undone.`
        }
        confirmText="Delete"
        isLoading={isSubmitting}
      />
    </div>
  );
}

