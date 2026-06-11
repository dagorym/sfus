"use client";

/**
 * /docs/new — Create a new wiki page (staff-gated).
 *
 * Client-side gating redirects unauthenticated visitors to login and shows
 * an error to non-staff users. The server gate (assertDocWriteAccess) is the
 * authoritative security boundary; this client check is defense-in-depth only.
 *
 * The form accepts an optional parentPath query parameter so pages can be
 * created under an existing node. The slug is optional and auto-derived from
 * the title on the server when omitted.
 *
 * Built generically: no UI rewrite is needed if the server gate is later
 * opened to other roles (e.g. members).
 */

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../auth-client";
import { createDocPage } from "../docs-client";
import { MarkdownEditor } from "../../../components/markdown-editor";
import styles from "../docs.module.css";

// ---------------------------------------------------------------------------
// Inner component — uses useSearchParams (requires Suspense boundary)
// ---------------------------------------------------------------------------

function DocsNewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentPath = searchParams?.get("parentPath") ?? undefined;

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Authorization check — defense-in-depth client gate
  // ------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const resolved = await resolveProtectedSession(
        parentPath ? `/docs/new?parentPath=${encodeURIComponent(parentPath)}` : "/docs/new"
      );
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
    };
    void check();
    return () => {
      mounted = false;
    };
  }, [router, parentPath]);

  // ------------------------------------------------------------------
  // Submit handler
  // ------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const created = await createDocPage({
        title: title.trim(),
        slug: slug.trim() || undefined,
        body,
        summary: summary.trim() || undefined,
        parentPath: parentPath
      });
      // Navigate to the newly created page
      router.replace(`/docs/${created.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create document.");
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------
  // Render: loading
  // ------------------------------------------------------------------

  if (authorized === null) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>New Page</h1>
        <p className={styles.description}>Checking authorization…</p>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Render: not staff
  // ------------------------------------------------------------------

  if (authorized === false) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Access denied.</h1>
        <p className={styles.error} role="alert">
          Staff access required to create documents.
        </p>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Render: form
  // ------------------------------------------------------------------

  return (
    <section className={styles.container}>
      <p className={styles.eyebrow}>Documents</p>
      <h1 className={styles.heading}>New Page</h1>

      {parentPath ? (
        <p className={styles.description}>
          Creating a sub-page under <strong>{parentPath}</strong>.
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : null}

      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <label className={styles.formLabel}>
          Title
          <input
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={saving}
            placeholder="Page title"
          />
        </label>

        <label className={styles.formLabel}>
          Slug{" "}
          <span className={styles.formHint}>(optional — auto-derived from title when blank)</span>
          <input
            className={styles.formInput}
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={saving}
            placeholder="my-page-slug"
          />
        </label>

        <label className={styles.formLabel}>
          Summary{" "}
          <span className={styles.formHint}>(optional)</span>
          <input
            className={styles.formInput}
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={saving}
            placeholder="Brief summary"
          />
        </label>

        <div className={styles.formLabel}>
          Body
          <MarkdownEditor
            value={body}
            onChange={setBody}
            disabled={saving}
            label="Page body"
            id="doc-body"
          />
        </div>

        <div className={styles.staffActions}>
          <button
            type="submit"
            className={styles.actionButton}
            disabled={saving || !title.trim()}
          >
            {saving ? "Creating…" : "Create page"}
          </button>
          <button
            type="button"
            className={styles.secondaryActionButton}
            disabled={saving}
            onClick={() =>
              router.push(parentPath ? `/docs/${parentPath}` : "/docs")
            }
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Exported page — wraps inner component in Suspense (required by useSearchParams)
// ---------------------------------------------------------------------------

export default function DocsNewPage() {
  return (
    <Suspense
      fallback={
        <section>
          <p>Loading…</p>
        </section>
      }
    >
      <DocsNewPageInner />
    </Suspense>
  );
}
