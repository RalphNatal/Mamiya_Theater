// ─────────────────────────────────────────────────────────────────────────────
// Roles and what each one may see in the admin area — the ONE place that says
// so. App.tsx (who may enter), AdminLoginScreen, the NavBar button,
// AdminDashboard + Sidebar (which sections) and BoxOfficeSection (walk-up
// selling) all read from here.
//
// This is UI routing, not the security boundary. The database enforces the
// same split independently: every revenue / payout / sales-total RPC and view
// checks role = 'admin' exactly (assert_admin), so a 'staff' session is
// refused there whatever this file says. Staff act only through assert_staff()
// RPCs (check_in_ticket, create_box_office_booking) plus the seat and price
// data the public seat picker already reads. See supabase/migrations/
// 20260924120000_*.sql, 20260925120000_*.sql and
// supabase/checks/staff_access_checklist.sql.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'user' | 'staff' | 'admin';
export type AdminRole = Exclude<Role, 'user'>;
export type SectionId = 'overview' | 'showtimes' | 'boxoffice' | 'seatmap' | 'users' | 'settings';

type RolePermissions = {
  // Sections this role sees. The FIRST entry is where the role lands.
  // (Productions has no sidebar entry: it is the "Manage Shows" modal inside
  // Overview, so it follows Overview.)
  sections: readonly SectionId[];
  // Walk-up SELLING in Box Office: showtime picker, seats remaining, seat map,
  // cart (check-in is always there). The DB side is create_box_office_booking,
  // which accepts staff + admin (assert_staff, 20260925120000) — turning this
  // off hides the UI but does not revoke that RPC.
  walkUpSales: boolean;
};

export const PERMISSIONS: Record<AdminRole, RolePermissions> = {
  admin: { sections: ['overview', 'showtimes', 'boxoffice', 'seatmap', 'users', 'settings'], walkUpSales: true },
  // Door staff: sell + check in, never Overview (earnings, KPIs, payouts).
  staff: { sections: ['boxoffice', 'settings'], walkUpSales: true },
};

export const ROLE_LABELS: Record<Role, string> = { user: 'User', staff: 'Staff', admin: 'Admin' };
// Assignable roles, lowest access first (UsersSection renders one button each).
export const ROLES: readonly Role[] = ['user', 'staff', 'admin'];

// May this role enter the admin area at all?
export const isAdminRole = (role: string | null | undefined): role is AdminRole =>
  !!role && Object.prototype.hasOwnProperty.call(PERMISSIONS, role);

export const canSeeSection = (role: AdminRole, section: string): section is SectionId =>
  PERMISSIONS[role].sections.includes(section as SectionId);

export const landingSection = (role: AdminRole): SectionId => PERMISSIONS[role].sections[0];

// The section to actually render: the requested one if permitted, otherwise the
// role's landing section. AdminDashboard renders ONLY through this, so a
// forbidden id (stale state, a demotion mid-session, a crafted call) can never
// mount that section.
export const resolveSection = (role: AdminRole, requested: string): SectionId =>
  canSeeSection(role, requested) ? requested : landingSection(role);
