/**
 * The permission catalogue. Every protected API route names one of these, and
 * tenants build custom roles by picking from this list (no code needed).
 * New modules add their permissions here.
 */
export const PERMISSIONS = {
  'tenant.manage': 'Change workspace settings, branding and enabled modules',
  'role.read': 'View roles and their permissions',
  'role.manage': 'Create, edit and assign roles',
  'org.read': 'View departments, designations, locations and legal entities',
  'org.manage': 'Create and edit departments, designations, locations and legal entities',
  'employee.read': 'View the employee directory',
  'employee.manage': 'Add and edit employee records',
  'audit.read': 'View the audit log',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** Roles every new workspace starts with. Tenants can edit non-owner roles and add their own. */
export const SYSTEM_ROLES: Record<
  'owner' | 'hr_admin' | 'manager' | 'employee',
  { name: string; permissions: Permission[] }
> = {
  owner: { name: 'Owner', permissions: ALL_PERMISSIONS },
  hr_admin: {
    name: 'HR Admin',
    permissions: [
      'role.read',
      'role.manage',
      'org.read',
      'org.manage',
      'employee.read',
      'employee.manage',
      'audit.read',
    ],
  },
  manager: { name: 'Manager', permissions: ['org.read', 'employee.read'] },
  employee: { name: 'Employee', permissions: ['org.read', 'employee.read'] },
};

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
