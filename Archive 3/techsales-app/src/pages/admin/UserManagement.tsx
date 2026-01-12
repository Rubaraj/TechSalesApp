import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, Filter, X } from 'lucide-react';
import { Button, Input, Select, Badge, Pagination, Modal, ConfirmModal } from '../../components/common';
import { Table } from '../../components/common/Table';
import { useAuth } from '../../context/AuthContext';
import type { User, Role, Department, AccessLevel } from '../../types';
import {
  searchUsers,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  getAllRoles,
  getAllDepartments,
  type UserSearchParams,
} from '../../services/userService';

const accessLevelOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'agent', label: 'Agent' },
  { value: 'viewer', label: 'Viewer' },
];

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<{
    roleId?: string;
    departmentId?: string;
    isActive?: boolean;
  }>({});
  const [showFilters, setShowFilters] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [sortField, setSortField] = useState<keyof User>('username');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    roleId: '',
    departmentId: '',
    accessLevel: 'agent' as AccessLevel,
    isActive: true,
    isSuperAdmin: false,
    markets: [] as string[],
  });

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      const [rolesRes, deptsRes] = await Promise.all([
        getAllRoles(),
        getAllDepartments(),
      ]);
      if (rolesRes.success && rolesRes.data) setRoles(rolesRes.data);
      if (deptsRes.success && deptsRes.data) setDepartments(deptsRes.data);
    };
    loadData();
  }, []);

  // Load users
  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    const params: UserSearchParams = {
      searchTerm: searchTerm || undefined,
      filters,
      sortField,
      sortDirection,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };

    const result = await searchUsers(params);
    if (result.success && result.data) {
      setUsers(result.data.data);
      setPagination({
        page: result.data.page,
        pageSize: result.data.pageSize,
        total: result.data.total,
        totalPages: result.data.totalPages,
      });
    }
    setIsLoading(false);
  }, [searchTerm, filters, sortField, sortDirection, pagination.page, pagination.pageSize]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Handle sort
  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as keyof User);
      setSortDirection('asc');
    }
  };

  // Handle create/edit
  const handleOpenModal = (user?: User) => {
    if (user) {
      setSelectedUser(user);
      setFormData({
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        departmentId: user.departmentId || '',
        accessLevel: user.accessLevel,
        isActive: user.isActive,
        isSuperAdmin: user.isSuperAdmin,
        markets: user.markets || [],
      });
    } else {
      setSelectedUser(null);
      setFormData({
        username: '',
        email: '',
        firstName: '',
        lastName: '',
        roleId: roles[0]?.roleId || '',
        departmentId: departments[0]?.departmentId || '',
        accessLevel: 'agent',
        isActive: true,
        isSuperAdmin: false,
        markets: [],
      });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUser(null);
    setError('');
  };

  const handleSubmit = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      if (selectedUser) {
        const result = await updateUser(selectedUser.userId, formData, currentUser?.userId || '');
        if (!result.success) {
          setError(result.error || 'Failed to update user');
          return;
        }
      } else {
        const result = await createUser(formData, currentUser?.userId || '');
        if (!result.success) {
          setError(result.error || 'Failed to create user');
          return;
        }
      }
      handleCloseModal();
      loadUsers();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDeleteClick = (user: User) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    const result = await deleteUser(selectedUser.userId);
    setIsSubmitting(false);
    
    if (result.success) {
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      loadUsers();
    } else {
      setError(result.error || 'Failed to delete user');
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (user: User) => {
    await toggleUserStatus(user.userId, currentUser?.userId || '');
    loadUsers();
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  // Get role/department name
  const getRoleName = (roleId: string) => roles.find(r => r.roleId === roleId)?.roleName || '-';
  const getDeptName = (deptId?: string) => departments.find(d => d.departmentId === deptId)?.departmentName || '-';

  // Table columns
  const columns = [
    {
      key: 'username',
      header: 'Username',
      sortable: true,
    },
    {
      key: 'fullName',
      header: 'Full Name',
      render: (user: User) => `${user.firstName} ${user.lastName}`,
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
    },
    {
      key: 'roleId',
      header: 'Role',
      render: (user: User) => (
        <Badge variant="primary">{getRoleName(user.roleId)}</Badge>
      ),
    },
    {
      key: 'departmentId',
      header: 'Department',
      render: (user: User) => getDeptName(user.departmentId),
    },
    {
      key: 'accessLevel',
      header: 'Access',
      render: (user: User) => (
        <Badge variant={user.accessLevel === 'admin' ? 'warning' : 'default'}>
          {user.accessLevel}
        </Badge>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (user: User) => (
        <Badge variant={user.isActive ? 'success' : 'danger'}>
          {user.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '150px',
      render: (user: User) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleStatus(user);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title={user.isActive ? 'Deactivate' : 'Activate'}
          >
            {user.isActive ? (
              <ToggleRight className="w-5 h-5 text-green-600" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-gray-400" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenModal(user);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Edit"
          >
            <Edit2 className="w-4 h-4 text-blue-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(user);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Delete"
            disabled={user.isSuperAdmin}
          >
            <Trash2 className={`w-4 h-4 ${user.isSuperAdmin ? 'text-gray-300' : 'text-red-600'}`} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <Button
            variant={showFilters ? 'primary' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          {(Object.keys(filters).length > 0 || searchTerm) && (
            <Button variant="ghost" onClick={clearFilters}>
              <X className="w-4 h-4" />
              Clear
            </Button>
          )}
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4" />
          Add User
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <Select
            label="Role"
            options={[{ value: '', label: 'All Roles' }, ...roles.map(r => ({ value: r.roleId, label: r.roleName }))]}
            value={filters.roleId || ''}
            onChange={(e) => setFilters({ ...filters, roleId: e.target.value || undefined })}
          />
          <Select
            label="Department"
            options={[{ value: '', label: 'All Departments' }, ...departments.map(d => ({ value: d.departmentId, label: d.departmentName }))]}
            value={filters.departmentId || ''}
            onChange={(e) => setFilters({ ...filters, departmentId: e.target.value || undefined })}
          />
          <Select
            label="Status"
            options={[
              { value: '', label: 'All Status' },
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ]}
            value={filters.isActive === undefined ? '' : String(filters.isActive)}
            onChange={(e) => setFilters({
              ...filters,
              isActive: e.target.value === '' ? undefined : e.target.value === 'true',
            })}
          />
        </div>
      )}

      {/* Table */}
      <Table
        data={users}
        columns={columns}
        keyField="userId"
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        isLoading={isLoading}
        emptyMessage="No users found"
      />

      {/* Pagination */}
      {pagination.total > 0 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={(page) => setPagination({ ...pagination, page })}
          onPageSizeChange={(size) => setPagination({ ...pagination, pageSize: size, page: 1 })}
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedUser ? 'Edit User' : 'Add New User'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={isSubmitting}>
              {selectedUser ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <Input
            label="First Name"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
          />
          <Input
            label="Last Name"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            required
          />
          <Select
            label="Role"
            options={roles.map(r => ({ value: r.roleId, label: r.roleName }))}
            value={formData.roleId}
            onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
            required
          />
          <Select
            label="Department"
            options={departments.map(d => ({ value: d.departmentId, label: d.departmentName }))}
            value={formData.departmentId}
            onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
            required
          />
          <Select
            label="Access Level"
            options={accessLevelOptions}
            value={formData.accessLevel}
            onChange={(e) => setFormData({ ...formData, accessLevel: e.target.value as AccessLevel })}
            required
          />
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">
              Active User
            </label>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedUser(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Delete User"
        message={`Are you sure you want to delete user "${selectedUser?.username}"? This action cannot be undone.`}
        confirmText="Delete"
        isLoading={isSubmitting}
      />
    </div>
  );
}

