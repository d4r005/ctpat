// Permisos por área: Seguridad (caseta/inspección/embarque/salida) vs Almacén.
// - Seguridad: inspector (guardia), supervisor, admin
// - Almacén: almacenista, supervisor, admin
// - Supervisor y admin tienen acceso a ambas áreas.
// - Inicio, histórico, chat y perfil son compartidos por todos los roles.

export type Role = 'inspector' | 'supervisor' | 'almacenista' | 'admin';

export const ALL_ROLES: Role[] = ['inspector', 'supervisor', 'almacenista', 'admin'];

/** Roles que pueden usar los módulos del área de Seguridad */
export const SECURITY_ROLES: Role[] = ['inspector', 'supervisor', 'admin'];

/** Roles que pueden usar el módulo de Almacén */
export const WAREHOUSE_ROLES: Role[] = ['almacenista', 'supervisor', 'admin'];

export function canAccessSecurity(role?: string): boolean {
  return !!role && SECURITY_ROLES.includes(role as Role);
}

export function canAccessWarehouse(role?: string): boolean {
  return !!role && WAREHOUSE_ROLES.includes(role as Role);
}

export function isAdminOrSupervisor(role?: string): boolean {
  return role === 'admin' || role === 'supervisor';
}

/** Nombre legible del rol (para chips y perfil) */
export function roleLabel(role?: string): string {
  switch (role) {
    case 'admin': return 'ADMINISTRADOR';
    case 'supervisor': return 'SUPERVISOR';
    case 'inspector': return 'INSPECTOR';
    case 'almacenista': return 'ALMACENISTA';
    default: return (role || 'USUARIO').toUpperCase();
  }
}
