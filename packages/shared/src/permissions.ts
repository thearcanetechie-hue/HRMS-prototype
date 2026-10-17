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
  'directory.read': 'See the company directory (names, roles, departments, work contact)',
  'team.read': 'See full records of people in your reporting line',
  'employee.read': 'See full records of every employee',
  'employee.manage': 'Add and edit employee records and invite people to sign in',
  'employee.sensitive.read': 'See unmasked PAN, Aadhaar, UAN, ESIC and bank details',
  'document.read': "See every employee's documents and HR-only folders",
  'document.manage': 'Upload, verify and delete any document; manage folders',
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
      'directory.read',
      'employee.read',
      'employee.manage',
      'employee.sensitive.read',
      'document.read',
      'document.manage',
      'audit.read',
    ],
  },
  manager: { name: 'Manager', permissions: ['org.read', 'directory.read', 'team.read'] },
  employee: { name: 'Employee', permissions: ['org.read', 'directory.read'] },
};

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
