"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

import Image from "next/image";

import { resolveProtectedSession, hasGlobalRole } from "../../../../auth-client";
import {
  adminGetPost,
  adminUpdatePost,
  adminPublishPost,
  adminUnpublishPost,
  adminPublishAt,
  adminToggleFeatured,
  type BlogPostDetail
} from "../../../../../app/blog/blog-client";
import { MarkdownEditor } from "../../../../../components/markdown-editor";
import { ImageUpload, type ImageUploadResult } from "../../../../../components/image-upload";
import styles from "../../../../auth-shell.module.css";

export default function AdminBlogEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [featuredImageId, setFeaturedImageId] = useState<string | null>(null);
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
        setSummary(fetched.summary ?? "");
        setBody(fetched.body);
        setTags(fetched.tags.join(", "));
        setFeaturedImageId(fetched.featuredImageId);
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
      const updated = await adminUpdatePost(id, {
        title,
        slug,
        body,
        summary: summary.trim() || null,
        featuredImageId,
        tags: tagList
      });
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
      const updated = await adminPublishAt(id, new Date(scheduleValue).toISOString());
      setPost(updated);
      setScheduleValue("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to schedule.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFeatured = async () => {
    setActionError(null);
    setSaving(true);
    try {
      const updated = await adminToggleFeatured(id);
      setPost(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to toggle featured.");
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
      {(() => {
        const isScheduled =
          post.status === "published" &&
          post.publishedAt !== null &&
          new Date(post.publishedAt) > new Date();
        const statusLabel = isScheduled
          ? `scheduled / goes live at ${new Date(post.publishedAt!).toLocaleString()}`
          : post.status;
        return (
          <p className={styles.description}>
            Status: <strong>{statusLabel}</strong>
            {post.isFeatured ? " · ★ Pinned/Featured" : ""}
            {post.publishedAt && !isScheduled ? ` · Published ${new Date(post.publishedAt).toLocaleDateString()}` : ""}
          </p>
        );
      })()}
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
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => void handleToggleFeatured()}
          disabled={saving}
        >
          {post.isFeatured ? "Unpin" : "Pin/feature"}
        </button>
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
          Summary (optional — shown in listings and meta)
          <input
            className={styles.input}
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief summary of this post"
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
          Featured image
          {featuredImageId ? (
            <div style={{ marginTop: "0.4rem", marginBottom: "0.4rem" }}>
              <Image
                src={`/api/media/${featuredImageId}`}
                alt="Featured image preview"
                width={180}
                height={120}
                style={{ objectFit: "cover", borderRadius: "4px" }}
              />
              <button
                type="button"
                onClick={() => setFeaturedImageId(null)}
                style={{ marginLeft: "0.75rem", cursor: "pointer", color: "#ffb4b4", background: "none", border: "none" }}
                disabled={saving}
              >
                Remove
              </button>
            </div>
          ) : null}
          <ImageUpload
            resourceType="blog-post"
            onUpload={(result: ImageUploadResult) => setFeaturedImageId(result.id)}
            onError={(msg) => setActionError(msg)}
            disabled={saving}
            label={featuredImageId ? "Replace featured image" : "Upload featured image"}
          />
        </div>
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
