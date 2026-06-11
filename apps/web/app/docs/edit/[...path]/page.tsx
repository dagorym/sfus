"use client";

/**
 * /docs/edit/[...path] — Edit an existing wiki page (staff-gated).
 *
 * URL pattern: /docs/edit/some/path/to/page
 *
 * Client-side gating redirects unauthenticated visitors to login and shows
 * an error to non-staff users. The server gate (assertDocWriteAccess) is the
 * authoritative security boundary; this client check is defense-in-depth only.
 *
 * Lock flow:
 *  1. On mount, the page is loaded by path.
 *  2. Staff may acquire the lock before editing; the editor works without a
 *     lock (the server will reject if a foreign lock is active).
 *  3. A 409 from save or lock-acquire surfaces the holder/expiry from
 *     error.details.{lockedByUserId, lockExpiresAt} per the API contract.
 *  4. On save, a new revision is created via POST /api/docs/:id/revisions.
 *  5. Rename (title/slug) is optionally applied via PATCH /api/docs/:id when
 *     the title or slug changed from the loaded value.
 *
 * Built generically: no UI rewrite is needed if the server gate is later
 * opened to other roles.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../../auth-client";
import {
  getDocPageByPath,
  addDocRevision,
  renameDocPage,
  acquireDocLock,
  releaseDocLock,
  isLockConflictError,
  type DocsPageShape,
  type LockConflictDetails
} from "../../docs-client";
import { MarkdownEditor } from "../../../../components/markdown-editor";
import styles from "../../docs.module.css";

export default function DocsEditPage() {
  const router = useRouter();
  const params = useParams<{ path: string[] }>();
  const pathSegments = params?.path ?? [];
  const fullPath = pathSegments.join("/");

  const [page, setPage] = useState<DocsPageShape | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  // Form fields (seeded from loaded page)
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");

  // Baseline values for detecting changes (used to decide whether to PATCH)
  const [originalTitle, setOriginalTitle] = useState("");
  const [originalSlug, setOriginalSlug] = useState("");

  // Lock state
  const [lockHeld, setLockHeld] = useState(false);
  const [lockConflict, setLockConflict] = useState<LockConflictDetails | null>(null);

  // Operation state
  const [saving, setSaving] = useState(false);
  const [lockWorking, setLockWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ------------------------------------------------------------------
  // Check whether the page is currently locked by someone else
  // ------------------------------------------------------------------

  const activeForeignLock = useCallback(
    (p: DocsPageShape, myUserId?: string): boolean => {
      if (!p.lock.isLocked) return false;
      if (!p.lock.lockExpiresAt) return false;
      if (new Date(p.lock.lockExpiresAt) <= new Date()) return false;
      if (myUserId && p.lock.lockedByUserId === myUserId) return false;
      return true;
    },
    []
  );

  // ------------------------------------------------------------------
  // Authorization check + load page
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!fullPath) return;
    let mounted = true;
    const load = async () => {
      const resolved = await resolveProtectedSession(`/docs/edit/${fullPath}`);
      if (!mounted) return;
      if (!resolved.session) {
        if (resolved.redirectTo) router.replace(resolved.redirectTo);
        return;
      }
      if (!hasGlobalRole(resolved.session.user, "moderator")) {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);

      try {
        const fetched = await getDocPageByPath(fullPath);
        if (!mounted) return;
        if (!fetched) {
          setError("Document not found.");
          return;
        }
        setPage(fetched);
        setTitle(fetched.title);
        setSlug(fetched.path.split("/").at(-1) ?? "");
        setBody(fetched.currentRevision?.body ?? "");
        setSummary(fetched.currentRevision?.summary ?? "");
        setOriginalTitle(fetched.title);
        setOriginalSlug(fetched.path.split("/").at(-1) ?? "");

        // If the page is locked by the current user, record that
        if (
          fetched.lock.isLocked &&
          fetched.lock.lockExpiresAt &&
          new Date(fetched.lock.lockExpiresAt) > new Date() &&
          fetched.lock.lockedByUserId === resolved.session.user.id
        ) {
          setLockHeld(true);
        }
      } catch (e) {
        if (mounted)
          setError(e instanceof Error ? e.message : "Failed to load document.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [fullPath, router]);

  // ------------------------------------------------------------------
  // Lock acquire
  // ------------------------------------------------------------------

  const handleAcquireLock = async () => {
    if (!page) return;
    setLockWorking(true);
    setLockConflict(null);
    setError(null);
    try {
      await acquireDocLock(page.id);
      setLockHeld(true);
    } catch (err) {
      if (isLockConflictError(err)) {
        setLockConflict(err.lockConflict);
      } else {
        setError(err instanceof Error ? err.message : "Failed to acquire lock.");
      }
    } finally {
      setLockWorking(false);
    }
  };

  // ------------------------------------------------------------------
  // Lock release
  // ------------------------------------------------------------------

  const handleReleaseLock = async () => {
    if (!page) return;
    setLockWorking(true);
    setError(null);
    try {
      await releaseDocLock(page.id);
      setLockHeld(false);
      setLockConflict(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release lock.");
    } finally {
      setLockWorking(false);
    }
  };

  // ------------------------------------------------------------------
  // Save (add revision + optional rename)
  // ------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!page) return;
    setError(null);
    setSaveSuccess(false);
    setSaving(true);

    try {
      // If title or slug changed, rename first (PATCH /api/docs/:id).
      // The server will also apply the lock check.
      const titleChanged = title.trim() !== originalTitle;
      const slugChanged = slug.trim() !== originalSlug;
      if (titleChanged || slugChanged) {
        const renamed = await renameDocPage(page.id, {
          title: titleChanged ? title.trim() : undefined,
          slug: slugChanged ? slug.trim() : undefined
        });
        setPage(renamed);
        // Update the originals so re-submit detects no further rename
        setOriginalTitle(title.trim());
        setOriginalSlug(slug.trim());
      }

      // Add revision (POST /api/docs/:id/revisions)
      const updated = await addDocRevision(page.id, {
        title: title.trim(),
        body,
        summary: summary.trim() || undefined
      });
      setPage(updated);
      setSaveSuccess(true);
    } catch (err) {
      if (isLockConflictError(err)) {
        setLockConflict(err.lockConflict);
      }
      setError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Render: loading / auth check
  // ------------------------------------------------------------------

  if (authorized === null) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Edit Page</h1>
        <p className={styles.description}>Checking authorization…</p>
      </section>
    );
  }

  if (authorized === false) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Access denied.</h1>
        <p className={styles.error} role="alert">
          Staff access required to edit documents.
        </p>
      </section>
    );
  }

  if (!page && !error) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Edit Page</h1>
        <p className={styles.description}>Loading document…</p>
      </section>
    );
  }

  if (error && !page) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Error</h1>
        <p className={styles.error} role="alert">{error}</p>
        <div style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className={styles.secondaryActionButton}
            onClick={() => router.push("/docs")}
          >
            Back to Documents
          </button>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Render: edit form
  // ------------------------------------------------------------------

  const foreignLock = page ? activeForeignLock(page) : false;

  return (
    <section className={styles.container}>
      <p className={styles.eyebrow}>Documents · Edit</p>
      <h1 className={styles.heading}>{originalTitle || "Edit Page"}</h1>

      {/* Lock indicator — visible when locked by someone else */}
      {foreignLock && page ? (
        <div className={styles.lockBanner} role="status">
          <span className={styles.lockIcon} aria-hidden="true">&#128274;</span>
          <span>
            This document is locked by another user.
            {page.lock.lockExpiresAt ? (
              <> Lock expires {new Date(page.lock.lockExpiresAt).toLocaleString()}.</>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* Lock-conflict details surfaced from 409 */}
      {lockConflict ? (
        <div className={styles.lockBanner} role="alert">
          <span className={styles.lockIcon} aria-hidden="true">&#128274;</span>
          <span>
            Lock held by user ID <code>{lockConflict.lockedByUserId}</code>.
            {lockConflict.lockExpiresAt ? (
              <> Expires {new Date(lockConflict.lockExpiresAt).toLocaleString()}.</>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* Lock controls */}
      {page ? (
        <div className={styles.staffActions}>
          {lockHeld ? (
            <button
              type="button"
              className={styles.secondaryActionButton}
              onClick={() => void handleReleaseLock()}
              disabled={lockWorking || saving}
            >
              {lockWorking ? "Releasing…" : "Release lock"}
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryActionButton}
              onClick={() => void handleAcquireLock()}
              disabled={lockWorking || saving}
            >
              {lockWorking ? "Acquiring…" : "Acquire lock"}
            </button>
          )}
          {lockHeld ? (
            <span className={styles.lockHeldIndicator} aria-live="polite">
              &#128275; Lock held
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Persistent error */}
      {error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : null}

      {/* Save-success confirmation */}
      {saveSuccess ? (
        <p className={styles.saveSuccess} role="status">
          Revision saved successfully.
        </p>
      ) : null}

      {/* Edit form */}
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <label className={styles.formLabel}>
          Title
          <input
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaveSuccess(false);
            }}
            required
            disabled={saving}
          />
        </label>

        <label className={styles.formLabel}>
          Slug{" "}
          <span className={styles.formHint}>(changing slug rewrites the URL and all descendant paths)</span>
          <input
            className={styles.formInput}
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSaveSuccess(false);
            }}
            disabled={saving}
          />
        </label>

        <label className={styles.formLabel}>
          Summary{" "}
          <span className={styles.formHint}>(optional)</span>
          <input
            className={styles.formInput}
            type="text"
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setSaveSuccess(false);
            }}
            disabled={saving}
            placeholder="Brief summary"
          />
        </label>

        <div className={styles.formLabel}>
          Body
          <MarkdownEditor
            value={body}
            onChange={(v) => {
              setBody(v);
              setSaveSuccess(false);
            }}
            disabled={saving}
            label="Page body"
            id="doc-body"
          />
        </div>

        <div className={styles.staffActions}>
          <button
            type="submit"
            className={styles.actionButton}
            disabled={saving || foreignLock}
          >
            {saving ? "Saving…" : "Save revision"}
          </button>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={saving}
            onClick={() =>
              router.push(page ? `/docs/${page.path}` : "/docs")
            }
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
