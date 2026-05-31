"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { getPublishedPost, type BlogPostDetail } from "../blog-client";
import { MarkdownRenderer } from "../../../components/markdown-renderer";
import styles from "../../auth-shell.module.css";

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [post, setPost] = useState<BlogPostDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    const load = async () => {
      try {
        const fetched = await getPublishedPost(slug);
        if (mounted) {
          setPost(fetched);
        }
      } catch {
        if (mounted) {
          setError("Unable to load this post.");
        }
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
        <p className={styles.eyebrow}>Star Log</p>
        <h2 className={styles.title}>Failed to load post.</h2>
        <p className={styles.error}>{error}</p>
        <div className={styles.actions}>
          <Link href="/blog" className={styles.secondaryAction}>
            Back to Star Log
          </Link>
        </div>
      </section>
    );
  }

  if (post === undefined) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Star Log</p>
        <h2 className={styles.title}>Loading…</h2>
        <p className={styles.status}>Retrieving transmission.</p>
      </section>
    );
  }

  if (post === null) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Star Log</p>
        <h2 className={styles.title}>Post not found.</h2>
        <p className={styles.description}>This dispatch does not exist or is not yet published.</p>
        <div className={styles.actions}>
          <Link href="/blog" className={styles.secondaryAction}>
            Back to Star Log
          </Link>
        </div>
      </section>
    );
  }

  return (
    <article className={styles.panel}>
      <p className={styles.eyebrow}>Star Log</p>
      <h2 className={styles.title}>{post.title}</h2>
      <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
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
      <MarkdownRenderer content={post.body} />
      <div className={styles.actions} style={{ marginTop: "2rem" }}>
        <Link href="/blog" className={styles.secondaryAction}>
          Back to Star Log
        </Link>
      </div>
    </article>
  );
}
