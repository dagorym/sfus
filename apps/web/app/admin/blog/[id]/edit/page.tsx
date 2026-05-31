"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../../../auth-client";
import {
  adminGetPost,
  adminUpdatePost,
  adminPublishPost,
  adminUnpublishPost,
  adminSchedulePost,
  type BlogPostDetail
} from "../../../../../app/blog/blog-client";
import { MarkdownEditor } from "../../../../../components/markdown-editor";
import styles from "../../../../auth-shell.module.css";

export default function AdminBlogEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [scheduleValue, setScheduleValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const load = async () => {
      const resolved = await resolveProtectedSession(`/admin/blog/${id}/edit`);
      if (!mounted) return;
      if (!resolved.session) {
        if (resolved.redirectTo) router.replace(resolved.redirectTo);
        return;
      }
      if (!hasGlobalRole(resolved.session.user, "admin")) {
        setError("Admin access required.");
        return;
      }
      setAuthorized(true);
      try {
        const fetched = await adminGetPost(id);
        if (!mounted) return;
        setPost(fetched);
        setTitle(fetched.title);
        setSlug(fetched.slug);
        setBody(fetched.body);
        setTags(fetched.tags.join(", "));
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : "Failed to load post.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [id, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setSaving(true);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const updated = await adminUpdatePost(id, { title, slug, body, tags: tagList });
      setPost(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setActionError(null);
    setSaving(true);
    try {
      const updated = await adminPublishPost(id);
      setPost(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to publish.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    setActionError(null);
    setSaving(true);
    try {
      const updated = await adminUnpublishPost(id);
      setPost(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to unpublish.");
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    setActionError(null);
    if (!scheduleValue) {
      setActionError("Enter a future datetime to schedule.");
      return;
    }
    setSaving(true);
    try {
      const updated = await adminSchedulePost(id, new Date(scheduleValue).toISOString());
      setPost(updated);
      setScheduleValue("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to schedule.");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Blog</p>
        <h2 className={styles.title}>Error.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!authorized || !post) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Blog</p>
        <h2 className={styles.title}>Loading…</h2>
        <p className={styles.status}>Loading post editor.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin · Blog · Edit</p>
      <h2 className={styles.title}>Edit Post</h2>
      <p className={styles.description}>
        Status: <strong>{post.status}</strong>
        {post.publishedAt ? ` · Published ${new Date(post.publishedAt).toLocaleDateString()}` : ""}
        {post.scheduledAt ? ` · Scheduled ${new Date(post.scheduledAt).toLocaleDateString()}` : ""}
      </p>
      {actionError ? <p className={styles.error}>{actionError}</p> : null}

      {/* Publish-state controls */}
      <div className={styles.actions}>
        {post.status !== "published" && (
          <button
            type="button"
            className={styles.action}
            onClick={() => void handlePublish()}
            disabled={saving}
          >
            Publish now
          </button>
        )}
        {post.status === "published" && (
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => void handleUnpublish()}
            disabled={saving}
          >
            Unpublish
          </button>
        )}
      </div>

      {/* Schedule controls */}
      {post.status !== "published" && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
          <input
            type="datetime-local"
            className={styles.input}
            value={scheduleValue}
            onChange={(e) => setScheduleValue(e.target.value)}
            disabled={saving}
            style={{ maxWidth: "16rem" }}
          />
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => void handleSchedule()}
            disabled={saving || !scheduleValue}
          >
            Schedule
          </button>
        </div>
      )}

      {/* Content editor */}
      <form className={styles.form} onSubmit={(e) => void handleSave(e)} style={{ marginTop: "1.5rem" }}>
        <label className={styles.label}>
          Title
          <input
            className={styles.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={saving}
          />
        </label>
        <label className={styles.label}>
          Slug
          <input
            className={styles.input}
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            disabled={saving}
          />
        </label>
        <label className={styles.label}>
          Tags (comma-separated)
          <input
            className={styles.input}
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            disabled={saving}
          />
        </label>
        <div className={styles.label}>
          Body
          <MarkdownEditor value={body} onChange={setBody} disabled={saving} />
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.action} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => router.push("/admin/blog")}
            disabled={saving}
          >
            Back to list
          </button>
        </div>
      </form>
    </section>
  );
}
