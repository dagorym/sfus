"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listPublishedPosts, type BlogPostSummary } from "./blog-client";
import styles from "../auth-shell.module.css";

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const fetched = await listPublishedPosts();
        if (mounted) {
          setPosts(fetched);
        }
      } catch {
        if (mounted) {
          setError("Unable to load blog posts.");
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
        <p className={styles.eyebrow}>Star Log</p>
        <h2 className={styles.title}>Failed to load posts.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!posts) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Star Log</p>
        <h2 className={styles.title}>Loading posts…</h2>
        <p className={styles.status}>Retrieving transmissions from the archive.</p>
      </section>
    );
  }

  if (posts.length === 0) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Star Log</p>
        <h2 className={styles.title}>No posts yet.</h2>
        <p className={styles.description}>Check back soon for dispatches from the frontier.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Star Log</p>
      <h2 className={styles.title}>Dispatches from the Frontier</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1.5rem" }}>
        {posts.map((post) => (
          <li key={post.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1.25rem" }}>
            <Link
              href={`/blog/${encodeURIComponent(post.slug)}`}
              style={{ fontWeight: 700, fontSize: "1.2rem", color: "var(--color-text)" }}
            >
              {post.title}
            </Link>
            <div style={{ marginTop: "0.4rem", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
              {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : ""}
              {post.tags.length > 0 ? (
                <span style={{ marginLeft: "1rem" }}>
                  {post.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        marginRight: "0.4rem",
                        padding: "0.1rem 0.5rem",
                        border: "1px solid var(--color-border)",
                        borderRadius: "999px",
                        fontSize: "0.78rem"
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
