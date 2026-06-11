"use client";

/**
 * /docs/[...path] — Documents wiki catch-all page view.
 *
 * Renders a single wiki page by its full slash-joined path.
 * Shows a breadcrumb trail derived from the page's ancestry.
 * Renders the current revision via the shared MarkdownRenderer.
 *
 * Read-only for anonymous/non-staff visitors.
 * Staff (moderator/admin) see edit, manage, and lock affordances.
 * A nonexistent or non-publicly-accessible path renders the not-found state
 * without distinguishing existence from visibility (oracle parity).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getDocPageByPath, type DocsPageShape } from "../docs-client";
import { readSession, hasGlobalRole, type SessionPayload } from "../../auth-client";
import { MarkdownRenderer } from "../../../components/markdown-renderer";
import styles from "../docs.module.css";

export default function DocsPageView() {
  const params = useParams<{ path: string[] }>();
  // useParams returns the catch-all as an array of decoded segments.
  const pathSegments = params?.path ?? [];
  const fullPath = pathSegments.join("/");

  const [page, setPage] = useState<DocsPageShape | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);

  useEffect(() => {
    if (!fullPath) return;
    let mounted = true;
    const load = async () => {
      try {
        const fetched = await getDocPageByPath(fullPath);
        if (mounted) setPage(fetched);
      } catch {
        if (mounted) setError("Unable to load this document.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [fullPath]);

  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      try {
        const s = await readSession();
        if (mounted) setSession(s);
      } catch {
        if (mounted) setSession(null);
      }
    };
    void loadSession();
    return () => {
      mounted = false;
    };
  }, []);

  const isStaff = session != null && session !== undefined && hasGlobalRole(session.user, "moderator");

  // ------------------------------------------------------------------
  // Loading state
  // ------------------------------------------------------------------

  if (page === undefined) {
    if (error) {
      return (
        <section className={styles.container}>
          <p className={styles.eyebrow}>Documents</p>
          <h1 className={styles.heading}>Error</h1>
          <p className={styles.error} role="alert">{error}</p>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/docs" className={styles.secondaryActionButton}>
              Back to Documents
            </Link>
          </div>
        </section>
      );
    }
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Loading…</h1>
        <p className={styles.description}>Retrieving document.</p>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Error state (page defined but error was set, e.g. on reload)
  // ------------------------------------------------------------------

  if (error) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Error</h1>
        <p className={styles.error} role="alert">{error}</p>
        <div style={{ marginTop: "1rem" }}>
          <Link href="/docs" className={styles.secondaryActionButton}>
            Back to Documents
          </Link>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Not found state (null = 404 from API — no oracle distinction)
  // ------------------------------------------------------------------

  if (page === null) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Document not found.</h1>
        <p className={styles.description}>
          This document does not exist or is not publicly accessible.
        </p>
        <div style={{ marginTop: "1rem" }}>
          <Link href="/docs" className={styles.secondaryActionButton}>
            Back to Documents
          </Link>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Page view
  // ------------------------------------------------------------------

  const isLocked =
    page.lock.isLocked &&
    page.lock.lockExpiresAt !== null &&
    new Date(page.lock.lockExpiresAt) > new Date();

  return (
    <article className={styles.container}>
      {/* Breadcrumbs */}
      {page.breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className={styles.breadcrumbs}>
            <li>
              <Link href="/docs" className={styles.breadcrumbLink}>
                Documents
              </Link>
            </li>
            {page.breadcrumbs.map((crumb) => (
              <li key={crumb.id} style={{ display: "contents" }}>
                <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
                <Link href={`/docs/${crumb.path}`} className={styles.breadcrumbLink}>
                  {crumb.title}
                </Link>
              </li>
            ))}
            <li style={{ display: "contents" }}>
              <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
              <span className={styles.breadcrumbCurrent} aria-current="page">
                {page.title}
              </span>
            </li>
          </ol>
        </nav>
      ) : (
        <nav aria-label="Breadcrumb">
          <ol className={styles.breadcrumbs}>
            <li>
              <Link href="/docs" className={styles.breadcrumbLink}>
                Documents
              </Link>
            </li>
            <li style={{ display: "contents" }}>
              <span className={styles.breadcrumbSeparator} aria-hidden="true">/</span>
              <span className={styles.breadcrumbCurrent} aria-current="page">
                {page.title}
              </span>
            </li>
          </ol>
        </nav>
      )}

      <p className={styles.eyebrow}>Documents</p>
      <h1 className={styles.heading}>{page.title}</h1>

      {/* Lock indicator — visible to all when page is locked */}
      {isLocked ? (
        <div className={styles.lockBanner} role="status">
          <span className={styles.lockIcon} aria-hidden="true">&#128274;</span>
          <span>
            This document is currently locked for editing.
            {page.lock.lockExpiresAt ? (
              <> Expires {new Date(page.lock.lockExpiresAt).toLocaleString()}.</>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* Staff affordances — defense-in-depth client gate */}
      {isStaff ? (
        <div className={styles.staffActions}>
          <Link href={`/docs/edit/${page.path}`} className={styles.actionButton}>
            Edit
          </Link>
          {!isLocked ? (
            <Link href={`/docs/edit/${page.path}`} className={styles.secondaryActionButton}>
              Acquire lock
            </Link>
          ) : null}
          <Link href={`/docs/history/${page.path}`} className={styles.secondaryActionButton}>
            History
          </Link>
        </div>
      ) : null}

      {/* Markdown body */}
      {page.currentRevision ? (
        <>
          {page.currentRevision.summary ? (
            <p className={styles.description}>{page.currentRevision.summary}</p>
          ) : null}
          <MarkdownRenderer content={page.currentRevision.body} />
          <p style={{ marginTop: "1.5rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
            Revision {page.currentRevision.revisionNumber}
            {page.currentRevision.author ? (
              <> by {page.currentRevision.author.displayName ?? page.currentRevision.author.username}</>
            ) : null}
            {" · "}
            {new Date(page.currentRevision.createdAt).toLocaleDateString()}
          </p>
        </>
      ) : (
        <p className={styles.description}>This page has no content yet.</p>
      )}

      <div style={{ marginTop: "2rem" }}>
        <Link href="/docs" className={styles.secondaryActionButton}>
          Back to Documents
        </Link>
      </div>
    </article>
  );
}
