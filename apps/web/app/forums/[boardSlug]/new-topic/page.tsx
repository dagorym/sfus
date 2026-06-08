"use client";

/**
 * Create-topic page — /forums/[boardSlug]/new-topic
 *
 * Authenticated members can start a new topic in a board.
 * Guests are redirected to login with ?next= preserved.
 *
 * Security:
 * - Requires active session (resolved via resolveProtectedSession).
 * - Body rendered only through MarkdownRenderer for preview (sanitized).
 * - The API enforces the actual auth + body-sanitization gate.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  listCategories,
  createTopic,
  type PublicBoardShape
} from "../../forums-client";
import { resolveProtectedSession } from "../../../auth-client";
import { MarkdownEditor } from "../../../../components/markdown-editor";
import { ImageUpload, type ImageUploadResult } from "../../../../components/image-upload";
import { MentionAutocomplete } from "../../../../components/mention-autocomplete";
import styles from "../../forums.module.css";

export default function NewTopicPage() {
  const params = useParams<{ boardSlug: string }>();
  const boardSlug = params?.boardSlug ?? "";
  const router = useRouter();

  const [board, setBoard] = useState<PublicBoardShape | null | undefined>(undefined);
  const [sessionReady, setSessionReady] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPath = `/forums/${encodeURIComponent(boardSlug)}/new-topic`;

  // Resolve session — redirect guests.
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { session, redirectTo } = await resolveProtectedSession(currentPath);
      if (!mounted) return;
      if (redirectTo || !session) {
        window.location.href = redirectTo ?? `/login?next=${encodeURIComponent(currentPath)}`;
        return;
      }
      setSessionReady(true);
    };
    void load();
    return () => { mounted = false; };
  }, [currentPath]);

  // Resolve board from category listing.
  useEffect(() => {
    if (!boardSlug) return;
    let mounted = true;
    const load = async () => {
      try {
        const categories = await listCategories();
        let resolved: PublicBoardShape | null = null;
        for (const cat of categories) {
          const found = cat.boards.find((b) => b.slug === boardSlug);
          if (found) { resolved = found; break; }
        }
        if (mounted) setBoard(resolved);
      } catch {
        if (mounted) setBoard(null);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [boardSlug]);

  const handleImageUpload = (result: ImageUploadResult) => {
    setBody((prev) => `${prev}\n![${result.altText || result.originalFilename}](${result.url})\n`);
  };

  const handleSubmit = async () => {
    if (!board || !title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const topic = await createTopic(board.id, title.trim(), body);
      router.push(`/forums/${encodeURIComponent(boardSlug)}/${encodeURIComponent(topic.slug)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create topic.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionReady || board === undefined) {
    return (
      <div className={styles.container}>
        <p className={styles.description}>Loading…</p>
      </div>
    );
  }

  if (board === null) {
    return (
      <div className={styles.container}>
        <Link href="/forums" className={styles.backLink}>← Forums</Link>
        <h1 className={styles.heading}>Board not found</h1>
        <p className={styles.description}>This board does not exist or is not publicly accessible.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <nav aria-label="breadcrumb">
        <ol className={styles.breadcrumb}>
          <li><Link href="/forums">Forums</Link></li>
          <li className={styles.breadcrumbSep} aria-hidden="true">›</li>
          <li><Link href={`/forums/${encodeURIComponent(boardSlug)}`}>{board.name}</Link></li>
          <li className={styles.breadcrumbSep} aria-hidden="true">›</li>
          <li aria-current="page">New Topic</li>
        </ol>
      </nav>

      <h1 className={styles.heading}>New Topic</h1>

      <form
        className={styles.form}
        onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
        aria-label="Create new topic"
      >
        <div>
          <label className={styles.formLabel} htmlFor="topic-title">
            Title
          </label>
          <input
            id="topic-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Topic title"
            className={styles.formInput}
            disabled={submitting}
            required
            maxLength={255}
            aria-label="Topic title"
          />
        </div>

        <div>
          <label className={styles.formLabel} htmlFor="topic-body">
            Body (Markdown supported, @username to mention)
          </label>
          {/* MentionAutocomplete for the body textarea */}
          <MentionAutocomplete
            id="topic-body"
            value={body}
            onChange={setBody}
            placeholder="Write your topic here…"
            rows={10}
            disabled={submitting}
            aria-label="Topic body"
          />
        </div>

        {/* Preview via MarkdownEditor write/preview toggle */}
        <details>
          <summary style={{ fontSize: "0.88rem", cursor: "pointer", color: "var(--color-accent, #7aa2ff)" }}>
            Preview body
          </summary>
          <div style={{ marginTop: "0.5rem" }}>
            <MarkdownEditor
              value={body}
              onChange={setBody}
              label=""
              rows={6}
              disabled={submitting}
            />
          </div>
        </details>

        <div>
          <ImageUpload
            resourceType="forum-post"
            onUpload={handleImageUpload}
            onError={(msg) => setError(msg)}
            disabled={submitting}
            label="Attach image"
          />
        </div>

        {error ? (
          <p className={styles.error} role="alert">{error}</p>
        ) : null}

        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting || !title.trim() || !body.trim()}
            aria-label="Submit new topic"
          >
            {submitting ? "Posting…" : "Post topic"}
          </button>
          <Link
            href={`/forums/${encodeURIComponent(boardSlug)}`}
            className={styles.signInLink}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
