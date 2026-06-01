"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../auth-client";
import {
  adminListNavItems,
  adminCreateNavItem,
  adminUpdateNavItem,
  adminDeleteNavItem,
  type NavigationItemDetail,
  type CreateNavigationItemInput
} from "../../../app/navigation/navigation-client";
import styles from "../../auth-shell.module.css";

export default function AdminNavigationPage() {
  const router = useRouter();
  const [items, setItems] = useState<NavigationItemDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create form state
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newLinkType, setNewLinkType] = useState<"internal" | "external">("internal");
  const [newVisibility, setNewVisibility] = useState<"public" | "authenticated">("public");
  const [newSortOrder, setNewSortOrder] = useState(0);
  const [newParentId, setNewParentId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resolved = await resolveProtectedSession("/admin/navigation");
        if (!mounted) return;
        if (!resolved.session) {
          if (resolved.redirectTo) router.replace(resolved.redirectTo);
          return;
        }
        if (!hasGlobalRole(resolved.session.user, "admin")) {
          setError("Admin access required.");
          return;
        }
        const fetched = await adminListNavItems();
        if (mounted) setItems(fetched);
      } catch {
        if (mounted) setError("Unable to load navigation items.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleCreate = async () => {
    setActionError(null);
    if (!newLabel.trim() || !newUrl.trim()) {
      setActionError("Label and URL are required.");
      return;
    }
    setCreating(true);
    try {
      const input: CreateNavigationItemInput = {
        label: newLabel.trim(),
        url: newUrl.trim(),
        linkType: newLinkType,
        visibility: newVisibility,
        sortOrder: newSortOrder,
        parentId: newParentId || null
      };
      const created = await adminCreateNavItem(input);
      // Reload the full list to get correct parent-child structure
      const refreshed = await adminListNavItems();
      setItems(refreshed);
      // Reset form
      setNewLabel("");
      setNewUrl("");
      setNewLinkType("internal");
      setNewVisibility("public");
      setNewSortOrder(0);
      setNewParentId("");
      void created;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (item: NavigationItemDetail) => {
    setActionError(null);
    try {
      const updated = await adminUpdateNavItem(item.id, { isActive: !item.isActive });
      setItems((prev) =>
        prev
          ? prev.map((i) => {
              if (i.id === updated.id) return updated;
              // Also update within children arrays
              return {
                ...i,
                children: i.children.map((c) => (c.id === updated.id ? updated : c))
              };
            })
          : prev
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Toggle failed.");
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    if (!window.confirm("Delete this navigation item? Child items will also be removed.")) return;
    try {
      await adminDeleteNavItem(id);
      const refreshed = await adminListNavItems();
      setItems(refreshed);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const handleMoveUp = async (item: NavigationItemDetail, siblings: NavigationItemDetail[]) => {
    setActionError(null);
    const idx = siblings.findIndex((s) => s.id === item.id);
    if (idx <= 0) return;
    const prev = siblings[idx - 1];
    try {
      await Promise.all([
        adminUpdateNavItem(item.id, { sortOrder: prev.sortOrder }),
        adminUpdateNavItem(prev.id, { sortOrder: item.sortOrder })
      ]);
      const refreshed = await adminListNavItems();
      setItems(refreshed);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reorder failed.");
    }
  };

  const handleMoveDown = async (item: NavigationItemDetail, siblings: NavigationItemDetail[]) => {
    setActionError(null);
    const idx = siblings.findIndex((s) => s.id === item.id);
    if (idx >= siblings.length - 1) return;
    const next = siblings[idx + 1];
    try {
      await Promise.all([
        adminUpdateNavItem(item.id, { sortOrder: next.sortOrder }),
        adminUpdateNavItem(next.id, { sortOrder: item.sortOrder })
      ]);
      const refreshed = await adminListNavItems();
      setItems(refreshed);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reorder failed.");
    }
  };

  if (error) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Navigation</p>
        <h2 className={styles.title}>Access denied.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!items) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Navigation</p>
        <h2 className={styles.title}>Loading navigation…</h2>
        <p className={styles.status}>Retrieving navigation management console.</p>
      </section>
    );
  }

  // Collect all top-level items as potential parents for the create form
  const topLevelItems = items;

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin · Navigation</p>
      <h2 className={styles.title}>Navigation Items</h2>
      {actionError ? <p className={styles.error}>{actionError}</p> : null}

      {/* Create form */}
      <div style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid var(--color-border)" }}>
        <h3 style={{ marginTop: 0 }}>Add Navigation Item</h3>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Blog"
              style={{ width: "100%", padding: "0.25rem 0.5rem" }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem" }}>URL</label>
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="e.g. /blog"
              style={{ width: "100%", padding: "0.25rem 0.5rem" }}
            />
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>Link Type</label>
              <select
                value={newLinkType}
                onChange={(e) => setNewLinkType(e.target.value as "internal" | "external")}
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="internal">Internal</option>
                <option value="external">External</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>Visibility</label>
              <select
                value={newVisibility}
                onChange={(e) => setNewVisibility(e.target.value as "public" | "authenticated")}
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="public">Public</option>
                <option value="authenticated">Authenticated only</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>Sort Order</label>
              <input
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(Number(e.target.value))}
                style={{ width: "80px", padding: "0.25rem 0.5rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>Parent (optional)</label>
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                style={{ padding: "0.25rem 0.5rem" }}
              >
                <option value="">— Top level —</option>
                {topLevelItems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className={styles.action}
              style={{ cursor: creating ? "not-allowed" : "pointer" }}
            >
              {creating ? "Creating…" : "Add item"}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation items table */}
      {items.length === 0 ? (
        <p className={styles.description}>No navigation items yet. Add the first one above.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Label</th>
              <th style={{ padding: "0.5rem" }}>URL</th>
              <th style={{ padding: "0.5rem" }}>Visibility</th>
              <th style={{ padding: "0.5rem" }}>Order</th>
              <th style={{ padding: "0.5rem" }}>Active</th>
              <th style={{ padding: "0.5rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <>
                <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.5rem", fontWeight: "bold" }}>{item.label}</td>
                  <td style={{ padding: "0.5rem" }}>{item.url}</td>
                  <td style={{ padding: "0.5rem" }}>{item.visibility}</td>
                  <td style={{ padding: "0.5rem" }}>{item.sortOrder}</td>
                  <td style={{ padding: "0.5rem" }}>{item.isActive ? "Yes" : "No"}</td>
                  <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => void handleToggleActive(item)}
                      style={{ cursor: "pointer", color: "var(--color-accent)", background: "none", border: "none" }}
                    >
                      {item.isActive ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMoveUp(item, items)}
                      disabled={idx === 0}
                      style={{ cursor: idx === 0 ? "default" : "pointer", background: "none", border: "none", color: "var(--color-text-muted)" }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMoveDown(item, items)}
                      disabled={idx === items.length - 1}
                      style={{ cursor: idx === items.length - 1 ? "default" : "pointer", background: "none", border: "none", color: "var(--color-text-muted)" }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                      style={{ cursor: "pointer", color: "#ffb4b4", background: "none", border: "none" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                {item.children.map((child, cidx) => (
                  <tr key={child.id} style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-subtle, #1a1a1a)" }}>
                    <td style={{ padding: "0.5rem", paddingLeft: "2rem" }}>↳ {child.label}</td>
                    <td style={{ padding: "0.5rem" }}>{child.url}</td>
                    <td style={{ padding: "0.5rem" }}>{child.visibility}</td>
                    <td style={{ padding: "0.5rem" }}>{child.sortOrder}</td>
                    <td style={{ padding: "0.5rem" }}>{child.isActive ? "Yes" : "No"}</td>
                    <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(child)}
                        style={{ cursor: "pointer", color: "var(--color-accent)", background: "none", border: "none" }}
                      >
                        {child.isActive ? "Hide" : "Show"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMoveUp(child, item.children)}
                        disabled={cidx === 0}
                        style={{ cursor: cidx === 0 ? "default" : "pointer", background: "none", border: "none", color: "var(--color-text-muted)" }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMoveDown(child, item.children)}
                        disabled={cidx === item.children.length - 1}
                        style={{ cursor: cidx === item.children.length - 1 ? "default" : "pointer", background: "none", border: "none", color: "var(--color-text-muted)" }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(child.id)}
                        style={{ cursor: "pointer", color: "#ffb4b4", background: "none", border: "none" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
