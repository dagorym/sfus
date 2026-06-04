"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getPublishedPage, type PageDetail } from "../pages-client";
import { MarkdownRenderer } from "../../../components/markdown-renderer";
import styles from "../../auth-shell.module.css";

export default function PublicPageBySlug() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [page, setPage] = useState<PageDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
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
  }, [slug]);

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
