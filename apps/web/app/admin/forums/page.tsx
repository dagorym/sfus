"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../auth-client";
import {
  adminListCategories,
  adminCreateCategory,
  adminUpdateCategory,
  adminDeleteCategory,
  adminReorderCategories,
  adminCreateBoard,
  adminUpdateBoard,
  adminDeleteBoard,
  adminReorderBoards,
  type AdminCategoryShape,
  type AdminBoardShape,
  type ForumBoardScopeType,
  type ForumBoardVisibility
} from "./forums-admin-client";
import styles from "../../auth-shell.module.css";

// ---------------------------------------------------------------------------
// Inline form state helpers
// ---------------------------------------------------------------------------

interface CategoryFormState {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
}

const emptyCategoryForm = (): CategoryFormState => ({
  name: "",
  slug: "",
  description: "",
  sortOrder: ""
});

interface BoardFormState {
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  scopeType: ForumBoardScopeType;
  visibility: ForumBoardVisibility;
  projectId: string;
}

const emptyBoardForm = (categoryId = ""): BoardFormState => ({
  categoryId,
  name: "",
  slug: "",
  description: "",
  sortOrder: "",
  scopeType: "site",
  visibility: "public",
  projectId: ""
});

function boardFormFromShape(board: AdminBoardShape): BoardFormState {
  return {
    categoryId: board.categoryId,
    name: board.name,
    slug: board.slug,
    description: board.description ?? "",
    sortOrder: String(board.sortOrder),
    scopeType: board.scopeType,
    visibility: board.visibility,
    projectId: board.projectId ?? ""
  };
}

function categoryFormFromShape(cat: AdminCategoryShape): CategoryFormState {
  return {
    name: cat.name,
    slug: cat.slug,
    description: cat.description ?? "",
    sortOrder: String(cat.sortOrder)
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AdminForumsPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<AdminCategoryShape[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Category create form
  const [showCategoryCreate, setShowCategoryCreate] = useState(false);
  const [categoryCreateForm, setCategoryCreateForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [categoryCreateBusy, setCategoryCreateBusy] = useState(false);

  // Category edit form — keyed by id
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryEditForm, setCategoryEditForm] = useState<CategoryFormState>(emptyCategoryForm());
  const [categoryEditBusy, setCategoryEditBusy] = useState(false);

  // Board create form — keyed by parent categoryId
  const [showBoardCreateFor, setShowBoardCreateFor] = useState<string | null>(null);
  const [boardCreateForm, setBoardCreateForm] = useState<BoardFormState>(emptyBoardForm());
  const [boardCreateBusy, setBoardCreateBusy] = useState(false);

  // Board edit form — keyed by board id
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [boardEditForm, setBoardEditForm] = useState<BoardFormState>(emptyBoardForm());
  const [boardEditBusy, setBoardEditBusy] = useState(false);

  // -------------------------------------------------------------------------
  // Auth gate + initial load
  // -------------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resolved = await resolveProtectedSession("/admin/forums");
        if (!mounted) return;
        if (!resolved.session) {
          if (resolved.redirectTo) router.replace(resolved.redirectTo);
          return;
        }
        if (!hasGlobalRole(resolved.session.user, "admin")) {
          setLoadError("Admin access required.");
          return;
        }
        const fetched = await adminListCategories();
        if (mounted) setCategories(fetched);
      } catch {
        if (mounted) setLoadError("Unable to load forums.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const clearFeedback = () => {
    setActionError(null);
    setActionSuccess(null);
  };

  const refreshCategories = async () => {
    const updated = await adminListCategories();
    setCategories(updated);
  };

  // -------------------------------------------------------------------------
  // Category handlers
  // -------------------------------------------------------------------------

  const handleCategoryCreate = async () => {
    clearFeedback();
    if (!categoryCreateForm.name.trim() || !categoryCreateForm.slug.trim()) {
      setActionError("Category name and slug are required.");
      return;
    }
    setCategoryCreateBusy(true);
    try {
      await adminCreateCategory({
        name: categoryCreateForm.name.trim(),
        slug: categoryCreateForm.slug.trim(),
        description: categoryCreateForm.description.trim() || null,
        sortOrder: categoryCreateForm.sortOrder !== "" ? Number(categoryCreateForm.sortOrder) : undefined
      });
      setCategoryCreateForm(emptyCategoryForm());
      setShowCategoryCreate(false);
      await refreshCategories();
      setActionSuccess("Category created.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Create category failed.");
    } finally {
      setCategoryCreateBusy(false);
    }
  };

  const startEditCategory = (cat: AdminCategoryShape) => {
    clearFeedback();
    setEditingCategoryId(cat.id);
    setCategoryEditForm(categoryFormFromShape(cat));
  };

  const handleCategoryEdit = async (id: string) => {
    clearFeedback();
    if (!categoryEditForm.name.trim() || !categoryEditForm.slug.trim()) {
      setActionError("Category name and slug are required.");
      return;
    }
    setCategoryEditBusy(true);
    try {
      await adminUpdateCategory(id, {
        name: categoryEditForm.name.trim(),
        slug: categoryEditForm.slug.trim(),
        description: categoryEditForm.description.trim() || null,
        sortOrder: categoryEditForm.sortOrder !== "" ? Number(categoryEditForm.sortOrder) : undefined
      });
      setEditingCategoryId(null);
      await refreshCategories();
      setActionSuccess("Category updated.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Update category failed.");
    } finally {
      setCategoryEditBusy(false);
    }
  };

  const handleCategoryDelete = async (id: string, boardCount: number) => {
    clearFeedback();
    if (boardCount > 0) {
      setActionError(
        "Cannot delete this category because it still has boards. Remove all boards from the category first."
      );
      return;
    }
    if (!window.confirm("Delete this category? This cannot be undone.")) return;
    try {
      await adminDeleteCategory(id);
      await refreshCategories();
      setActionSuccess("Category deleted.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete category failed.";
      // Surface the "category must have no boards" 400 as a friendly message
      if (/board|must be empty|not empty/i.test(msg)) {
        setActionError("Cannot delete this category because it still has boards.");
      } else {
        setActionError(msg);
      }
    }
  };

  const handleCategoryMoveUp = async (cat: AdminCategoryShape) => {
    clearFeedback();
    if (!categories) return;
    const idx = categories.findIndex((c) => c.id === cat.id);
    if (idx <= 0) return;
    const ordered = categories.map((c) => c.id);
    ordered.splice(idx, 1);
    ordered.splice(idx - 1, 0, cat.id);
    try {
      await adminReorderCategories({ orderedIds: ordered });
      await refreshCategories();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reorder failed.");
    }
  };

  const handleCategoryMoveDown = async (cat: AdminCategoryShape) => {
    clearFeedback();
    if (!categories) return;
    const idx = categories.findIndex((c) => c.id === cat.id);
    if (idx >= categories.length - 1) return;
    const ordered = categories.map((c) => c.id);
    ordered.splice(idx, 1);
    ordered.splice(idx + 1, 0, cat.id);
    try {
      await adminReorderCategories({ orderedIds: ordered });
      await refreshCategories();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reorder failed.");
    }
  };

  // -------------------------------------------------------------------------
  // Board handlers
  // -------------------------------------------------------------------------

  const startBoardCreate = (categoryId: string) => {
    clearFeedback();
    setShowBoardCreateFor(categoryId);
    setBoardCreateForm(emptyBoardForm(categoryId));
  };

  const handleBoardCreate = async () => {
    clearFeedback();
    if (!boardCreateForm.name.trim() || !boardCreateForm.slug.trim()) {
      setActionError("Board name and slug are required.");
      return;
    }
    setBoardCreateBusy(true);
    try {
      await adminCreateBoard({
        categoryId: boardCreateForm.categoryId,
        name: boardCreateForm.name.trim(),
        slug: boardCreateForm.slug.trim(),
        description: boardCreateForm.description.trim() || null,
        sortOrder: boardCreateForm.sortOrder !== "" ? Number(boardCreateForm.sortOrder) : undefined,
        scopeType: boardCreateForm.scopeType,
        visibility: boardCreateForm.visibility,
        projectId: boardCreateForm.projectId.trim() || null
      });
      setBoardCreateForm(emptyBoardForm());
      setShowBoardCreateFor(null);
      await refreshCategories();
      setActionSuccess("Board created.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Create board failed.");
    } finally {
      setBoardCreateBusy(false);
    }
  };

  const startEditBoard = (board: AdminBoardShape) => {
    clearFeedback();
    setEditingBoardId(board.id);
    setBoardEditForm(boardFormFromShape(board));
  };

  const handleBoardEdit = async (id: string) => {
    clearFeedback();
    if (!boardEditForm.name.trim() || !boardEditForm.slug.trim()) {
      setActionError("Board name and slug are required.");
      return;
    }
    setBoardEditBusy(true);
    try {
      await adminUpdateBoard(id, {
        name: boardEditForm.name.trim(),
        slug: boardEditForm.slug.trim(),
        description: boardEditForm.description.trim() || null,
        sortOrder: boardEditForm.sortOrder !== "" ? Number(boardEditForm.sortOrder) : undefined,
        scopeType: boardEditForm.scopeType,
        visibility: boardEditForm.visibility,
        projectId: boardEditForm.projectId.trim() || null
      });
      setEditingBoardId(null);
      await refreshCategories();
      setActionSuccess("Board updated.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Update board failed.");
    } finally {
      setBoardEditBusy(false);
    }
  };

  const handleBoardDelete = async (id: string) => {
    clearFeedback();
    if (!window.confirm("Delete this board? This cannot be undone.")) return;
    try {
      await adminDeleteBoard(id);
      await refreshCategories();
      setActionSuccess("Board deleted.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete board failed.");
    }
  };

  const handleBoardMoveUp = async (board: AdminBoardShape, siblings: AdminBoardShape[]) => {
    clearFeedback();
    const idx = siblings.findIndex((b) => b.id === board.id);
    if (idx <= 0) return;
    const ordered = siblings.map((b) => b.id);
    ordered.splice(idx, 1);
    ordered.splice(idx - 1, 0, board.id);
    try {
      await adminReorderBoards(board.categoryId, { orderedIds: ordered });
      await refreshCategories();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reorder failed.");
    }
  };

  const handleBoardMoveDown = async (board: AdminBoardShape, siblings: AdminBoardShape[]) => {
    clearFeedback();
    const idx = siblings.findIndex((b) => b.id === board.id);
    if (idx >= siblings.length - 1) return;
    const ordered = siblings.map((b) => b.id);
    ordered.splice(idx, 1);
    ordered.splice(idx + 1, 0, board.id);
    try {
      await adminReorderBoards(board.categoryId, { orderedIds: ordered });
      await refreshCategories();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reorder failed.");
    }
  };

  // -------------------------------------------------------------------------
  // Render helpers — all user-supplied text rendered as React text nodes
  // -------------------------------------------------------------------------

  const renderCategoryForm = (
    form: CategoryFormState,
    setForm: (f: CategoryFormState) => void,
    onSubmit: () => void,
    onCancel: () => void,
    busy: boolean,
    submitLabel: string
  ) => (
    <div
      style={{
        padding: "1rem",
        border: "1px solid var(--color-border)",
        marginBottom: "0.75rem"
      }}
    >
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. General Discussion"
            maxLength={128}
            style={{ width: "100%", padding: "0.25rem 0.5rem" }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Slug *</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="e.g. general-discussion"
            style={{ width: "100%", padding: "0.25rem 0.5rem" }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional description"
            maxLength={512}
            style={{ width: "100%", padding: "0.25rem 0.5rem" }}
          />
          <span style={{ fontSize: "0.8em", color: "var(--color-text-muted)" }}>max 512 characters</span>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Sort Order</label>
          <input
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            placeholder="0"
            style={{ width: "80px", padding: "0.25rem 0.5rem" }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={busy}
            className={styles.action}
            style={{ cursor: busy ? "not-allowed" : "pointer", minWidth: "8rem" }}
          >
            {busy ? "Saving…" : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={styles.secondaryAction}
            style={{ cursor: "pointer", minWidth: "6rem" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  const renderBoardForm = (
    form: BoardFormState,
    setForm: (f: BoardFormState) => void,
    onSubmit: () => void,
    onCancel: () => void,
    busy: boolean,
    submitLabel: string
  ) => (
    <div
      style={{
        padding: "1rem",
        border: "1px solid var(--color-border)",
        marginBottom: "0.75rem"
      }}
    >
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Rules & Announcements"
            maxLength={128}
            style={{ width: "100%", padding: "0.25rem 0.5rem" }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Slug *</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="e.g. rules-announcements"
            style={{ width: "100%", padding: "0.25rem 0.5rem" }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional description"
            maxLength={512}
            style={{ width: "100%", padding: "0.25rem 0.5rem" }}
          />
          <span style={{ fontSize: "0.8em", color: "var(--color-text-muted)" }}>max 512 characters</span>
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>Sort Order</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              placeholder="0"
              style={{ width: "80px", padding: "0.25rem 0.5rem" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>Scope Type</label>
            <select
              value={form.scopeType}
              onChange={(e) => setForm({ ...form, scopeType: e.target.value as ForumBoardScopeType })}
              style={{ padding: "0.25rem 0.5rem" }}
            >
              <option value="site">Site</option>
              <option value="project">Project</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>Visibility</label>
            <select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value as ForumBoardVisibility })}
              style={{ padding: "0.25rem 0.5rem" }}
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="members">Members only</option>
              <option value="project-only">Project only</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Project ID (optional)</label>
          <input
            type="text"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            placeholder="Leave blank for site-scoped boards"
            style={{ width: "100%", padding: "0.25rem 0.5rem" }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={busy}
            className={styles.action}
            style={{ cursor: busy ? "not-allowed" : "pointer", minWidth: "8rem" }}
          >
            {busy ? "Saving…" : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={styles.secondaryAction}
            style={{ cursor: "pointer", minWidth: "6rem" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Loading / denied states
  // -------------------------------------------------------------------------

  if (loadError) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Forums</p>
        <h2 className={styles.title}>Access denied.</h2>
        <p className={styles.error}>{loadError}</p>
      </section>
    );
  }

  if (categories === null) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Forums</p>
        <h2 className={styles.title}>Loading forums…</h2>
        <p className={styles.status}>Retrieving forum management console.</p>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin · Forums</p>
      <h2 className={styles.title}>Forums Management</h2>

      {actionError ? <p className={styles.error}>{actionError}</p> : null}
      {actionSuccess ? <p className={styles.status}>{actionSuccess}</p> : null}

      {/* Create category button / form */}
      {showCategoryCreate ? (
        <div>
          <h3 style={{ marginTop: 0 }}>New Category</h3>
          {renderCategoryForm(
            categoryCreateForm,
            setCategoryCreateForm,
            handleCategoryCreate,
            () => {
              setShowCategoryCreate(false);
              setCategoryCreateForm(emptyCategoryForm());
            },
            categoryCreateBusy,
            "Create category"
          )}
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => {
              clearFeedback();
              setShowCategoryCreate(true);
            }}
            className={styles.action}
            style={{ cursor: "pointer" }}
          >
            New category
          </button>
        </div>
      )}

      {/* Empty state */}
      {categories.length === 0 ? (
        <p className={styles.description}>
          No forum categories yet. Create the first one above.
        </p>
      ) : null}

      {/* Category list */}
      {categories.map((cat, catIdx) => (
        <div
          key={cat.id}
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "8px",
            padding: "1rem",
            marginTop: "1rem"
          }}
        >
          {/* Category header */}
          {editingCategoryId === cat.id ? (
            <div>
              <h3 style={{ marginTop: 0 }}>Edit Category</h3>
              {renderCategoryForm(
                categoryEditForm,
                setCategoryEditForm,
                () => void handleCategoryEdit(cat.id),
                () => setEditingCategoryId(null),
                categoryEditBusy,
                "Save changes"
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginBottom: "0.75rem"
              }}
            >
              <div>
                <strong>{cat.name}</strong>
                <span
                  style={{ marginLeft: "0.5rem", color: "var(--color-text-muted)", fontSize: "0.85em" }}
                >
                  /{cat.slug}
                </span>
                {cat.description ? (
                  <p style={{ margin: "0.25rem 0 0", color: "var(--color-text-muted)" }}>
                    {cat.description}
                  </p>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => void handleCategoryMoveUp(cat)}
                  disabled={catIdx === 0}
                  aria-label="Move category up"
                  style={{
                    cursor: catIdx === 0 ? "default" : "pointer",
                    background: "none",
                    border: "none",
                    color: "var(--color-text-muted)"
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => void handleCategoryMoveDown(cat)}
                  disabled={catIdx === categories.length - 1}
                  aria-label="Move category down"
                  style={{
                    cursor: catIdx === categories.length - 1 ? "default" : "pointer",
                    background: "none",
                    border: "none",
                    color: "var(--color-text-muted)"
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => startEditCategory(cat)}
                  style={{ cursor: "pointer", color: "var(--color-accent)", background: "none", border: "none" }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleCategoryDelete(cat.id, cat.boards.length)}
                  style={{ cursor: "pointer", color: "#ffb4b4", background: "none", border: "none" }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* Board list for this category */}
          {cat.boards.length === 0 ? (
            <p style={{ margin: "0.5rem 0", color: "var(--color-text-muted)", fontSize: "0.9em" }}>
              No boards in this category.
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
              <thead>
                <tr
                  style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}
                >
                  <th style={{ padding: "0.35rem 0.5rem" }}>Board</th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>Slug</th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>Scope</th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>Visibility</th>
                  <th style={{ padding: "0.35rem 0.5rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cat.boards.map((board, boardIdx) => (
                  <tr key={board.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {editingBoardId === board.id ? (
                      <td colSpan={5} style={{ padding: "0.5rem" }}>
                        <strong>Edit Board</strong>
                        {renderBoardForm(
                          boardEditForm,
                          setBoardEditForm,
                          () => void handleBoardEdit(board.id),
                          () => setEditingBoardId(null),
                          boardEditBusy,
                          "Save changes"
                        )}
                      </td>
                    ) : (
                      <>
                        <td style={{ padding: "0.35rem 0.5rem" }}>{board.name}</td>
                        <td style={{ padding: "0.35rem 0.5rem" }}>{board.slug}</td>
                        <td style={{ padding: "0.35rem 0.5rem" }}>{board.scopeType}</td>
                        <td style={{ padding: "0.35rem 0.5rem" }}>{board.visibility}</td>
                        <td
                          style={{
                            padding: "0.35rem 0.5rem",
                            display: "flex",
                            gap: "0.5rem",
                            flexWrap: "wrap"
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => void handleBoardMoveUp(board, cat.boards)}
                            disabled={boardIdx === 0}
                            aria-label="Move board up"
                            style={{
                              cursor: boardIdx === 0 ? "default" : "pointer",
                              background: "none",
                              border: "none",
                              color: "var(--color-text-muted)"
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleBoardMoveDown(board, cat.boards)}
                            disabled={boardIdx === cat.boards.length - 1}
                            aria-label="Move board down"
                            style={{
                              cursor: boardIdx === cat.boards.length - 1 ? "default" : "pointer",
                              background: "none",
                              border: "none",
                              color: "var(--color-text-muted)"
                            }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditBoard(board)}
                            style={{
                              cursor: "pointer",
                              color: "var(--color-accent)",
                              background: "none",
                              border: "none"
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleBoardDelete(board.id)}
                            style={{
                              cursor: "pointer",
                              color: "#ffb4b4",
                              background: "none",
                              border: "none"
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Board create form / button for this category */}
          {showBoardCreateFor === cat.id ? (
            <div style={{ marginTop: "0.75rem" }}>
              <strong>New Board in {cat.name}</strong>
              {renderBoardForm(
                boardCreateForm,
                setBoardCreateForm,
                handleBoardCreate,
                () => {
                  setShowBoardCreateFor(null);
                  setBoardCreateForm(emptyBoardForm());
                },
                boardCreateBusy,
                "Create board"
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startBoardCreate(cat.id)}
              style={{
                marginTop: "0.75rem",
                cursor: "pointer",
                color: "var(--color-accent)",
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.85em"
              }}
            >
              + Add board
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
