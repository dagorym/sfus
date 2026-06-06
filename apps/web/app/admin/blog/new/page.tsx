"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import Image from "next/image";

import { resolveProtectedSession, hasGlobalRole } from "../../../auth-client";
import { adminCreatePost } from "../../../../app/blog/blog-client";
import { MarkdownEditor } from "../../../../components/markdown-editor";
import { ImageUpload, type ImageUploadResult } from "../../../../components/image-upload";
import styles from "../../../auth-shell.module.css";

export default function AdminBlogNewPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [featuredImageId, setFeaturedImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const resolved = await resolveProtectedSession("/admin/blog/new");
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
    };
    void check();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const post = await adminCreatePost({
        title,
        slug,
        body,
        summary: summary.trim() || null,
        featuredImageId,
        tags: tagList
      });
      router.replace(`/admin/blog/${post.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post.");
    } finally {
      setSaving(false);
    }
  };

  if (error && !authorized) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Blog</p>
        <h2 className={styles.title}>Access denied.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!authorized) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Blog</p>
        <h2 className={styles.title}>Checking authorization…</h2>
        <p className={styles.status}>Verifying admin session.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin · Blog</p>
      <h2 className={styles.title}>New Post</h2>
      {error ? <p className={styles.error}>{error}</p> : null}
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
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
            placeholder="my-post-slug"
            disabled={saving}
          />
          <span style={{ fontSize: "0.8em", color: "#aaa" }}>
            Optional — auto-generated from the title when left blank.
          </span>
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
            placeholder="space, rpg, frontier"
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
            onError={(msg) => setError(msg)}
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
            {saving ? "Saving…" : "Create draft"}
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => router.push("/admin/blog")}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
