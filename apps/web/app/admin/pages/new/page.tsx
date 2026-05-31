"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../../../auth-client";
import { adminCreatePage } from "../../../../app/pages/pages-client";
import { MarkdownEditor } from "../../../../components/markdown-editor";
import styles from "../../../auth-shell.module.css";

export default function AdminPagesNewPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const resolved = await resolveProtectedSession("/admin/pages/new");
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
      const page = await adminCreatePage({ title, slug, body });
      router.replace(`/admin/pages/${page.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create page.");
    } finally {
      setSaving(false);
    }
  };

  if (error && !authorized) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Pages</p>
        <h2 className={styles.title}>Access denied.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!authorized) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin · Pages</p>
        <h2 className={styles.title}>Checking authorization…</h2>
        <p className={styles.status}>Verifying admin session.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin · Pages</p>
      <h2 className={styles.title}>New Page</h2>
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
            placeholder="about-us"
            required
            disabled={saving}
          />
        </label>
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
            onClick={() => router.push("/admin/pages")}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
