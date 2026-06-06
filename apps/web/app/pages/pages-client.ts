/**
 * Standalone pages API client helpers.
 *
 * Public routes (getPublishedBySlug) need no session cookie.
 * Admin routes require an active session and the admin global role on the
 * server side — the cookie is forwarded automatically via credentials:include.
 */

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

export interface PageDetail {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: string;
  publishedAt: string | null;
  currentRevisionId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  featuredMediaId: string | null;
}

export interface RevisionDetail {
  id: string;
  pageId: string;
  authorUserId: string;
  editorUserId: string | null;
  title: string;
  body: string;
  summary: string | null;
  changeNote: string | null;
  featuredMediaId: string | null;
  revisionNumber: number;
  createdAt: string;
}

export interface CreatePageInput {
  title: string;
  slug: string;
  body: string;
  summary?: string | null;
  changeNote?: string | null;
  featuredMediaId?: string | null;
}

export interface UpdatePageInput {
  title?: string;
  slug?: string;
  body?: string;
  summary?: string | null;
  changeNote?: string | null;
  featuredMediaId?: string | null;
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

export async function getPublishedPage(slug: string): Promise<PageDetail | null> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(slug)}`, {
    cache: "no-store"
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to load page.");
  }
  const data = (await response.json()) as { page: PageDetail };
  return data.page;
}

// ---------------------------------------------------------------------------
// Admin routes — require active session cookie
// ---------------------------------------------------------------------------

export async function adminListAllPages(): Promise<PageDetail[]> {
  const response = await fetch(`${apiBase}/pages/admin/pages`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load pages.");
  }
  const data = (await response.json()) as { pages: PageDetail[] };
  return data.pages;
}

export async function adminGetPage(id: string): Promise<PageDetail> {
  const response = await fetch(`${apiBase}/pages/admin/pages/${encodeURIComponent(id)}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load page.");
  }
  const data = (await response.json()) as { page: PageDetail };
  return data.page;
}

export async function adminCreatePage(input: CreatePageInput): Promise<PageDetail> {
  const response = await fetch(`${apiBase}/pages/admin/pages`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to create page.");
  }
  const data = (await response.json()) as { page: PageDetail };
  return data.page;
}

export async function adminUpdatePage(id: string, input: UpdatePageInput): Promise<PageDetail> {
  const response = await fetch(`${apiBase}/pages/admin/pages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to update page.");
  }
  const data = (await response.json()) as { page: PageDetail };
  return data.page;
}

export async function adminPublishPage(id: string): Promise<PageDetail> {
  const response = await fetch(`${apiBase}/pages/admin/pages/${encodeURIComponent(id)}/publish`, {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to publish page.");
  }
  const data = (await response.json()) as { page: PageDetail };
  return data.page;
}

export async function adminUnpublishPage(id: string): Promise<PageDetail> {
  const response = await fetch(`${apiBase}/pages/admin/pages/${encodeURIComponent(id)}/unpublish`, {
    method: "POST",
    credentials: "include"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to unpublish page.");
  }
  const data = (await response.json()) as { page: PageDetail };
  return data.page;
}

export async function adminListRevisions(id: string): Promise<RevisionDetail[]> {
  const response = await fetch(`${apiBase}/pages/admin/pages/${encodeURIComponent(id)}/revisions`, {
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to load revisions.");
  }
  const data = (await response.json()) as { revisions: RevisionDetail[] };
  return data.revisions;
}

export async function adminRestoreRevision(pageId: string, revisionId: string): Promise<PageDetail> {
  const response = await fetch(
    `${apiBase}/pages/admin/pages/${encodeURIComponent(pageId)}/restore/${encodeURIComponent(revisionId)}`,
    {
      method: "POST",
      credentials: "include"
    }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
    throw new Error(payload?.error?.message || payload?.message || "Failed to restore revision.");
  }
  const data = (await response.json()) as { page: PageDetail };
  return data.page;
}
