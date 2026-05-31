"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../auth-client";
import {
  adminListAllPosts,
  adminPublishPost,
  adminUnpublishPost,
  adminDeletePost,
  type BlogPostDetail
} from "../../../app/blog/blog-client";
import styles from "../../auth-shell.module.css";

export default function AdminBlogListPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPostDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resolved = await resolveProtectedSession("/admin/blog");
        if (!mounted) return;
        if (!resolved.session) {
          if (resolved.redirectTo) router.replace(resolved.redirectTo);
          return;
        }
        if (!hasGlobalRole(resolved.session.user, "admin")) {
          setError("Admin access required.");
          return;
        }
        const fetched = await adminListAllPosts();
        if (mounted) setPosts(fetched);
      } catch {
        if (mounted) setError("Unable to load blog posts.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handlePublish = async (id: string) => {
    setActionError(null);
    try {
      const updated = await adminPublishPost(id);
      setPosts((prev) => prev ? prev.map((p) => (p.id === id ? updated : p)) : prev);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Publish failed.");
    }
  };

  const handleUnpublish = async (id: string) => {
    setActionError(null);
    try {
      const updated = await adminUnpublishPost(id);
      setPosts((prev) => prev ? prev.map((p) => (p.id === id ? updated : p)) : prev);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unpublish failed.");
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await adminDeletePost(id);
      setPosts((prev) => prev ? prev.filter((p) => p.id !== id) : prev);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  if (error) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Blog</p>
        <h2 className={styles.title}>Access denied.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!posts) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Blog</p>
        <h2 className={styles.title}>Loading posts…</h2>
        <p className={styles.status}>Retrieving content management console.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin · Blog</p>
      <h2 className={styles.title}>Blog Posts</h2>
      {actionError ? <p className={styles.error}>{actionError}</p> : null}
      <div className={styles.actions}>
        <Link href="/admin/blog/new" className={styles.action}>
          New post
        </Link>
        <Link href="/blog" className={styles.secondaryAction}>
          View public blog
        </Link>
      </div>
      {posts.length === 0 ? (
        <p className={styles.description}>No blog posts yet. Create the first one.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Title</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Published</th>
              <th style={{ padding: "0.5rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.5rem" }}>{post.title}</td>
                <td style={{ padding: "0.5rem" }}>{post.status}</td>
                <td style={{ padding: "0.5rem" }}>
                  {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : "—"}
                </td>
                <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Link href={`/admin/blog/${post.id}/edit`} style={{ color: "var(--color-accent)" }}>
                    Edit
                  </Link>
                  {post.status !== "published" ? (
                    <button
                      type="button"
                      onClick={() => void handlePublish(post.id)}
                      style={{ cursor: "pointer", color: "var(--color-accent)", background: "none", border: "none" }}
                    >
                      Publish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleUnpublish(post.id)}
                      style={{ cursor: "pointer", color: "var(--color-text-muted)", background: "none", border: "none" }}
                    >
                      Unpublish
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(post.id)}
                    style={{ cursor: "pointer", color: "#ffb4b4", background: "none", border: "none" }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
