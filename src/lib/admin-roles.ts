/**
 * Roles and permissions, with no server-only imports.
 *
 * The admin sidebar needs these to decide what to show, and it runs in the
 * browser — so they live apart from admin-auth.ts, which imports next/headers
 * and Node crypto. admin-auth re-exports everything here, so server code can
 * keep importing from one place.
 *
 * The UI only mirrors these rules. Every route enforces them independently;
 * hiding a link is a convenience, never the control.
 */

export type AdminRole = "super_admin" | "designer" | "viewer";

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

/** What each role may do. */
export const PERMISSIONS: Record<AdminRole, string[]> = {
  // Full control, including managing other admins.
  super_admin: ["*"],
  // Content and media only — never pricing, orders, payments or settings.
  designer: ["content.edit", "media.upload", "products.view", "orders.view"],
  // Read-only, and only the sales orders.
  viewer: ["orders.view"],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  designer: "Designer",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: "Full control, including managing admin accounts",
  designer: "Edit product images and descriptions. Cannot change prices, orders or settings",
  viewer: "View sales orders only. Cannot edit anything",
};

/**
 * Product fields a designer may change. Anything touching price, stock or
 * identity is excluded — a design role must not be able to alter what a
 * customer is charged.
 */
export const DESIGNER_PRODUCT_FIELDS = [
  "description",
  "short_description",
  "image_url",
  "images",
  "page_sections",
  "video_url",
];

export function hasPermission(role: AdminRole | undefined, permission: string): boolean {
  if (!role) return false;
  const granted = PERMISSIONS[role] || [];
  return granted.includes("*") || granted.includes(permission);
}
