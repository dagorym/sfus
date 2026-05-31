"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  getPublishedPost,
  listComments,
  createComment,
  type BlogPostDetail,
  type BlogCommentDetail
} from "../blog-client";
import { readSession, type SessionPayload } from "../../auth-client";
import { MarkdownRenderer } from "../../../components/markdown-renderer";
import { MarkdownEditor } from "../../../components/markdown-editor";
import { ImageUpload, type ImageUploadResult } from "../../../components/image-upload";
import styles from "../../auth-shell.module.css";

export default function BlogPostPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const [post, setPost] = useState<BlogPostDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<BlogCommentDetail[]>([]);
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);
  const [commentBody, setCommentBody] = useState("");
  const [commentImageId, setCommentImageId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSuccess, setCommentSuccess] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let mounted = true;
    const load = async () => {
      try {
        const fetched = await getPublishedPost(slug);
        if (mounted) {
          setPost(fetched);
        }
        // Load comments once the post id is known.
        if (fetched && mounted) {
          try {
            const fetchedComments = await listComments(fetched.id);
            if (mounted) setComments(fetchedComments);
          } catch {
            // Comments failing to load should not block the post.
          }
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

  // Load session independently to determine if the comment form should be shown.
  useEffect(() => {
    let mounted = true;
    const loadSession = async () => {
      try {
        const s = await readSession();
        if (mounted) setSession(s);
      } catch {
        if (mounted) setSession(null);
      }
    };
    void loadSession();
    return () => {
      mounted = false;
    };
  }, []);

  const handleImageUpload = (result: ImageUploadResult) => {
    setCommentImageId(result.id);
    // Insert the image URL into the comment body at the current cursor position.
    setCommentBody((prev) => `${prev}\n![${result.originalFilename}](${result.url})\n`);
  };

  const handleSubmitComment = async () => {
    if (!post || !commentBody.trim()) return;
    setSubmitting(true);
    setCommentError(null);
    setCommentSuccess(false);
    try {
      const newComment = await createComment(post.id, commentBody, commentImageId);
      setComments((prev) => [...prev, newComment]);
      setCommentBody("");
      setCommentImageId(null);
      setCommentSuccess(true);
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : "Failed to submit comment.");
    } finally {
      setSubmitting(false);
    }
  };

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

      {/* Comments section */}
      <section aria-label="Comments" style={{ marginTop: "3rem" }}>
        <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
          Comments {comments.length > 0 ? `(${comments.length})` : ""}
        </h3>
        {comments.length === 0 ? (
          <p className={styles.status}>No comments yet. Be the first to reply.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1rem" }}>
            {comments.map((c) => (
              <li
                key={c.id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem"
                }}
              >
                <MarkdownRenderer content={c.body} />
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                  {new Date(c.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* Comment form — visible only to authenticated members */}
        {session === undefined ? null : session === null ? (
          <p className={styles.description} style={{ marginTop: "1.5rem" }}>
            <Link href={`/login?next=/blog/${encodeURIComponent(slug)}`} className={styles.secondaryAction}>
              Sign in to leave a comment
            </Link>
          </p>
        ) : (
          <div style={{ marginTop: "1.5rem" }}>
            <h4 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Leave a comment</h4>
            <MarkdownEditor
              id="comment-body"
              label="Comment (Markdown supported)"
              value={commentBody}
              onChange={setCommentBody}
              rows={5}
              placeholder="Write your comment here…"
              disabled={submitting}
            />
            <div style={{ marginTop: "0.75rem" }}>
              <ImageUpload
                resourceType="blog-comment"
                onUpload={handleImageUpload}
                onError={(msg) => setCommentError(msg)}
                disabled={submitting}
                label="Attach image"
              />
            </div>
            {commentError && (
              <p className={styles.error} role="alert" style={{ marginTop: "0.5rem" }}>
                {commentError}
              </p>
            )}
            {commentSuccess && (
              <p style={{ marginTop: "0.5rem", color: "var(--color-accent)" }} role="status">
                Comment posted.
              </p>
            )}
            <div style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className={styles.action}
                onClick={handleSubmitComment}
                disabled={submitting || !commentBody.trim()}
                style={{ minWidth: "8rem" }}
              >
                {submitting ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        )}
      </section>
    </article>
  );
}
