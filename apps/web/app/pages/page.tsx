"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listPublishedPages, type PageSummary } from "./pages-client";
import styles from "../auth-shell.module.css";

export default function PublicPagesIndexPage() {
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const fetched = await listPublishedPages();
        if (mounted) {
          setPages(fetched);
        }
      } catch {
        if (mounted) {
          setError("Unable to load pages.");
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>Error</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!pages) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>Loading…</h2>
        <p className={styles.status}>Retrieving pages.</p>
      </section>
    );
  }

  if (pages.length === 0) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>Pages</h2>
        <p className={styles.description}>No pages have been published yet.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Pages</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1rem" }}>
        {pages.map((page) => (
          <li key={page.slug} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem" }}>
            <Link
              href={`/pages/${encodeURIComponent(page.slug)}`}
              style={{ fontWeight: 600, fontSize: "1.1rem", color: "var(--color-text)" }}
            >
              {page.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
