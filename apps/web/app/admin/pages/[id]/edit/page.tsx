"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../../../auth-client";
import {
  adminGetPage,
  adminUpdatePage,
  adminPublishPage,
  adminUnpublishPage,
  adminListRevisions,
  adminRestoreRevision,
  type PageDetail,
  type RevisionDetail
} from "../../../../../app/pages/pages-client";
import { MarkdownEditor } from "../../../../../components/markdown-editor";
import { MarkdownRenderer } from "../../../../../components/markdown-renderer";
import { ImageUpload, type ImageUploadResult } from "../../../../../components/image-upload";
import styles from "../../../../auth-shell.module.css";

export default function AdminPagesEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [page, setPage] = useState<PageDetail | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [featuredMediaId, setFeaturedMediaId] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<RevisionDetail[] | null>(null);
  const [previewRevision, setPreviewRevision] = useState<RevisionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const load = async () => {
      const resolved = await resolveProtectedSession(`/admin/pages/${id}/edit`);
      if (!mounted) return;
      if (!resolved.session) {
        if (resolved.redirectTo) router.replace(resolved.redirectTo);
        return;
      }
      if (!hasGlobalRole(resolved.session.user, "admin")) {
        setError("Admin access required.");
        return;
      }
      setAuthorized(true);
      try {
        const [fetched, fetchedRevisions] = await Promise.all([
          adminGetPage(id),
          adminListRevisions(id)
        ]);
        if (!mounted) return;
        setPage(fetched);
        setTitle(fetched.title);
        setSlug(fetched.slug);
        setBody(fetched.body);
        setSummary(fetched.summary ?? "");
        setFeaturedMediaId(fetched.featuredMediaId ?? null);
        setRevisions(fetchedRevisions);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load page.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [id, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setSaving(true);
    try {
      const updated = await adminUpdatePage(id, {
        title,
        slug,
        body,
        summary: summary.trim() || null,
        changeNote: changeNote.trim() || null,
        featuredMediaId
      });
      setPage(updated);
      setBody(updated.body);
      setSummary(updated.summary ?? "");
      setFeaturedMediaId(updated.featuredMediaId ?? null);
      setChangeNote("");
      // Refresh revision list after save.
      const updatedRevisions = await adminListRevisions(id);
      setRevisions(updatedRevisions);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleFeaturedImageUpload = (result: ImageUploadResult) => {
    setFeaturedMediaId(result.id);
  };

  const handlePublish = async () => {
    setActionError(null);
    setSaving(true);
    try {
      const updated = await adminPublishPage(id);
      setPage(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to publish.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    setActionError(null);
    setSaving(true);
    try {
      const updated = await adminUnpublishPage(id);
      setPage(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to unpublish.");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (revisionId: string) => {
    setActionError(null);
    if (!window.confirm("Restore this revision? A new revision will be created with its content.")) return;
    setSaving(true);
    try {
      const updated = await adminRestoreRevision(id, revisionId);
      setPage(updated);
      setTitle(updated.title);
      setBody(updated.body);
      setSummary(updated.summary ?? "");
      setFeaturedMediaId(updated.featuredMediaId ?? null);
      // Refresh revision list.
      const updatedRevisions = await adminListRevisions(id);
      setRevisions(updatedRevisions);
      setPreviewRevision(null);
      setShowRevisions(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to restore revision.");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Pages</p>
        <h2 className={styles.title}>Error.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!authorized || !page) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Pages</p>
        <h2 className={styles.title}>Loading…</h2>
        <p className={styles.status}>Loading page editor.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin · Pages · Edit</p>
      <h2 className={styles.title}>Edit Page</h2>
      <p className={styles.description}>
        Status: <strong>{page.status}</strong>
        {page.publishedAt ? ` · Published ${new Date(page.publishedAt).toLocaleDateString()}` : ""}
      </p>
      {actionError ? <p className={styles.error}>{actionError}</p> : null}

      {/* Publish-state controls */}
      <div className={styles.actions}>
        {page.status !== "published" && (
          <button
            type="button"
            className={styles.action}
            onClick={() => void handlePublish()}
            disabled={saving}
          >
            Publish now
          </button>
        )}
        {page.status === "published" && (
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => void handleUnpublish()}
            disabled={saving}
          >
            Unpublish
          </button>
        )}
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => setShowRevisions((v) => !v)}
        >
          {showRevisions ? "Hide revisions" : "Revision history"}
        </button>
      </div>

      {/* Revision history panel */}
      {showRevisions && revisions && (
        <div style={{ marginTop: "1rem", border: "1px solid var(--color-border)", borderRadius: "8px", padding: "1rem" }}>
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Revision History</h3>
          {revisions.length === 0 ? (
            <p className={styles.description}>No revisions yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
              {[...revisions].reverse().map((rev) => (
                <li
                  key={rev.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.5rem",
                    borderBottom: "1px solid var(--color-border)"
                  }}
                >
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", minWidth: "6rem" }}>
                    Rev. {rev.revisionNumber}
                  </span>
                  <span style={{ flex: 1, fontSize: "0.9rem" }}>{rev.title}</span>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                    {new Date(rev.createdAt).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    style={{ cursor: "pointer", color: "var(--color-accent)", background: "none", border: "none", fontSize: "0.85rem" }}
                    onClick={() => setPreviewRevision(previewRevision?.id === rev.id ? null : rev)}
                  >
                    {previewRevision?.id === rev.id ? "Hide" : "Preview"}
                  </button>
                  {rev.id !== page.currentRevisionId && (
                    <button
                      type="button"
                      style={{ cursor: "pointer", color: "var(--color-text-muted)", background: "none", border: "none", fontSize: "0.85rem" }}
                      onClick={() => void handleRestore(rev.id)}
                      disabled={saving}
                    >
                      Restore
                    </button>
                  )}
                  {rev.id === page.currentRevisionId && (
                    <span style={{ color: "var(--color-accent)", fontSize: "0.8rem", fontWeight: 700 }}>current</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {previewRevision && (
            <div style={{ marginTop: "1rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem" }}>
              <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
                Preview: Rev. {previewRevision.revisionNumber} — {previewRevision.title}
              </h4>
              <MarkdownRenderer content={previewRevision.body} />
            </div>
          )}
        </div>
      )}

      {/* Content editor */}
      <form className={styles.form} onSubmit={(e) => void handleSave(e)} style={{ marginTop: "1.5rem" }}>
        <label className={styles.label}>
          Title
          <input
            className={styles.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={saving}
          />
        </label>
        <label className={styles.label}>
          Slug
          <input
            className={styles.input}
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            disabled={saving}
          />
        </label>
        <label className={styles.label}>
          Summary
          <input
            className={styles.input}
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Optional brief description of this page"
            disabled={saving}
          />
        </label>
        <div className={styles.label}>
          Featured Image
          <ImageUpload
            resourceType="standalone-page"
            onUpload={handleFeaturedImageUpload}
            disabled={saving}
            label="Upload featured image"
          />
          {featuredMediaId ? (
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              Featured image set (id: {featuredMediaId}){" "}
              <button
                type="button"
                style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: "0.85rem" }}
                onClick={() => setFeaturedMediaId(null)}
              >
                Remove
              </button>
            </span>
          ) : null}
        </div>
        <div className={styles.label}>
          Body
          <MarkdownEditor value={body} onChange={setBody} disabled={saving} />
        </div>
        <label className={styles.label}>
          Change note
          <input
            className={styles.input}
            type="text"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="Optional note describing this edit (saved with the revision)"
            disabled={saving}
          />
        </label>
        <div className={styles.actions}>
          <button type="submit" className={styles.action} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => router.push("/admin/pages")}
            disabled={saving}
          >
            Back to list
          </button>
        </div>
      </form>
    </section>
  );
}
