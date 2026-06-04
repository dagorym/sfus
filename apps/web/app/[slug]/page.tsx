"use client";

/**
 * Top-level standalone page catch-all route.
 *
 * Serves published standalone pages at top-level paths (e.g. /about, /rules,
 * /contact). This route is a dynamic segment ([slug]) and is therefore
 * evaluated by Next.js AFTER all static segments defined in the app directory,
 * so it never shadows existing routes (/, /blog, /login, /register, etc.).
 *
 * Reserved slugs (matching the API-side RESERVED_PAGE_SLUGS list) are rejected
 * at routing time with a not-found state rather than querying the API.
 *
 * Security notes:
 * - Only published pages are fetched; the API enforces published-only visibility.
 * - Reserved slugs are blocked client-side as a defence-in-depth measure; the
 *   API also rejects reserved slugs on create/update.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getPublishedPage, type PageDetail } from "../pages/pages-client";
import { MarkdownRenderer } from "../../components/markdown-renderer";
import styles from "../auth-shell.module.css";

/**
 * Slugs reserved by the application routing layer. A top-level path matching
 * one of these must never be claimed by a standalone page — it belongs to a
 * real route (static or dynamic segment) defined elsewhere in the app directory.
 *
 * This mirrors the server-side RESERVED_PAGE_SLUGS in pages.service.ts.
 */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "blog",
  "login",
  "register",
  "onboarding",
  "profile",
  "settings",
  "health"
]);

export default function TopLevelPageBySlug() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [page, setPage] = useState<PageDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // Reject reserved slugs immediately — do not query the API.
  const isReserved = RESERVED_SLUGS.has(slug);

  useEffect(() => {
    if (!slug || isReserved) return;
    let mounted = true;
    const load = async () => {
      try {
        const fetched = await getPublishedPage(slug);
        if (mounted) setPage(fetched);
      } catch {
        if (mounted) setError("Unable to load page.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [slug, isReserved]);

  // Reserved slug: surface as not-found rather than querying the API.
  if (isReserved) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>Page not found.</h2>
        <p className={styles.description}>This page does not exist or is not published.</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>Error</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (page === undefined) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>Loading…</h2>
        <p className={styles.status}>Retrieving page.</p>
      </section>
    );
  }

  if (page === null) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>Page not found.</h2>
        <p className={styles.description}>This page does not exist or is not published.</p>
      </section>
    );
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api";

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{page.title}</h2>
      {page.featuredMediaId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}/media/${encodeURIComponent(page.featuredMediaId)}`}
          alt={page.title}
          style={{ maxWidth: "100%", marginBottom: "1rem", borderRadius: "8px" }}
        />
      ) : null}
      <MarkdownRenderer content={page.body} />
    </section>
  );
}
