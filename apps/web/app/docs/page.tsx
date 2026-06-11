"use client";

/**
 * /docs — Documents wiki index page.
 *
 * Shows the site-root page tree (top-level published pages).
 * Read-only for anonymous/non-staff visitors.
 * Staff (moderator/admin) see a "Create page" affordance.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { getDocPageTree, type DocsTreeItem } from "./docs-client";
import { readSession, hasGlobalRole, type SessionPayload } from "../auth-client";
import styles from "./docs.module.css";

export default function DocsIndexPage() {
  const [pages, setPages] = useState<DocsTreeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const fetched = await getDocPageTree();
        if (mounted) setPages(fetched ?? []);
      } catch {
        if (mounted) setError("Unable to load the documents index.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

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

  if (error) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Wiki</h1>
        <p className={styles.error} role="alert">{error}</p>
      </section>
    );
  }

  if (pages === null) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents</p>
        <h1 className={styles.heading}>Wiki</h1>
        <p className={styles.description}>Loading…</p>
      </section>
    );
  }

  return (
    <section className={styles.container}>
      <p className={styles.eyebrow}>Documents</p>
      <h1 className={styles.heading}>Wiki</h1>

      {/* Staff affordance: create a new root page */}
      {isStaff ? (
        <div className={styles.staffActions}>
          <Link href="/docs/new" className={styles.actionButton}>
            Create page
          </Link>
        </div>
      ) : null}

      {pages.length === 0 ? (
        <p className={styles.description}>No pages have been published yet.</p>
      ) : (
        <ul className={styles.treeList}>
          {pages.map((page) => (
            <li key={page.id} className={styles.treeItem}>
              <Link href={`/docs/${page.path}`} className={styles.treeLink}>
                {page.title}
              </Link>
              {page.hasChildren ? (
                <p className={styles.treeChildrenHint}>Has sub-pages</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
