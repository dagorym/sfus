"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../auth-client";
import {
  adminListAllPages,
  adminPublishPage,
  adminUnpublishPage,
  type PageDetail
} from "../../../app/pages/pages-client";
import styles from "../../auth-shell.module.css";

export default function AdminPagesListPage() {
  const router = useRouter();
  const [pages, setPages] = useState<PageDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resolved = await resolveProtectedSession("/admin/pages");
        if (!mounted) return;
        if (!resolved.session) {
          if (resolved.redirectTo) router.replace(resolved.redirectTo);
          return;
        }
        if (!hasGlobalRole(resolved.session.user, "admin")) {
          setError("Admin access required.");
          return;
        }
        const fetched = await adminListAllPages();
        if (mounted) setPages(fetched);
      } catch {
        if (mounted) setError("Unable to load pages.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handlePublish = async (id: string) => {
    setActionError(null);
    try {
      const updated = await adminPublishPage(id);
      setPages((prev) => prev ? prev.map((p) => (p.id === id ? updated : p)) : prev);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Publish failed.");
    }
  };

  const handleUnpublish = async (id: string) => {
    setActionError(null);
    try {
      const updated = await adminUnpublishPage(id);
      setPages((prev) => prev ? prev.map((p) => (p.id === id ? updated : p)) : prev);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unpublish failed.");
    }
  };

  if (error) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Pages</p>
        <h2 className={styles.title}>Access denied.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!pages) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Pages</p>
        <h2 className={styles.title}>Loading pages…</h2>
        <p className={styles.status}>Retrieving content management console.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin · Pages</p>
      <h2 className={styles.title}>Standalone Pages</h2>
      {actionError ? <p className={styles.error}>{actionError}</p> : null}
      <div className={styles.actions}>
        <Link href="/admin/pages/new" className={styles.action}>
          New page
        </Link>
      </div>
      {pages.length === 0 ? (
        <p className={styles.description}>No pages yet. Create the first one.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Title</th>
              <th style={{ padding: "0.5rem" }}>Slug</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Published</th>
              <th style={{ padding: "0.5rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.5rem" }}>{page.title}</td>
                <td style={{ padding: "0.5rem" }}>
                  {page.status === "published" ? (
                    <Link href={`/pages/${page.slug}`} style={{ color: "var(--color-accent)" }}>
                      {page.slug}
                    </Link>
                  ) : (
                    page.slug
                  )}
                </td>
                <td style={{ padding: "0.5rem" }}>{page.status}</td>
                <td style={{ padding: "0.5rem" }}>
                  {page.publishedAt ? new Date(page.publishedAt).toLocaleDateString() : "—"}
                </td>
                <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Link href={`/admin/pages/${page.id}/edit`} style={{ color: "var(--color-accent)" }}>
                    Edit
                  </Link>
                  {page.status !== "published" ? (
                    <button
                      type="button"
                      onClick={() => void handlePublish(page.id)}
                      style={{ cursor: "pointer", color: "var(--color-accent)", background: "none", border: "none" }}
                    >
                      Publish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleUnpublish(page.id)}
                      style={{ cursor: "pointer", color: "var(--color-text-muted)", background: "none", border: "none" }}
                    >
                      Unpublish
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
