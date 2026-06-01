/**
 * Navigation API client helpers.
 *
 * Admin routes (adminListAll, adminCreate, adminUpdate, adminDelete) require
 * an active session with the global admin role. The session cookie is
 * forwarded automatically via credentials:include.
 */

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

export interface NavigationItemDetail {
  id: string;
  parentId: string | null;
  label: string;
  linkType: string;
  url: string;
  visibility: string;
  sortOrder: number;
  isActive: boolean;
  children: NavigationItemDetail[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateNavigationItemInput {
  label: string;
  url: string;
  linkType?: "internal" | "external";
  visibility?: "public" | "authenticated";
  sortOrder?: number;
  parentId?: string | null;
}

export interface UpdateNavigationItemInput {
  label?: string;
  url?: string;
  linkType?: "internal" | "external";
  visibility?: "public" | "authenticated";
  sortOrder?: number;
  isActive?: boolean;
  parentId?: string | null;
}

// ---------------------------------------------------------------------------
// Admin routes — require active session cookie with admin role
// ---------------------------------------------------------------------------

export async function adminListNavItems(): Promise<NavigationItemDetail[]> {
  const response = await fetch(`${apiBase}/navigation/admin`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to load navigation items.");
  }
  const data = (await response.json()) as { items: NavigationItemDetail[] };
  return data.items;
}

export async function adminCreateNavItem(input: CreateNavigationItemInput): Promise<NavigationItemDetail> {
  const response = await fetch(`${apiBase}/navigation/admin`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to create navigation item.");
  }
  const data = (await response.json()) as { item: NavigationItemDetail };
  return data.item;
}

export async function adminUpdateNavItem(
  id: string,
  input: UpdateNavigationItemInput
): Promise<NavigationItemDetail> {
  const response = await fetch(`${apiBase}/navigation/admin/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to update navigation item.");
  }
  const data = (await response.json()) as { item: NavigationItemDetail };
  return data.item;
}

export async function adminDeleteNavItem(id: string): Promise<void> {
  const response = await fetch(`${apiBase}/navigation/admin/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to delete navigation item.");
  }
}
