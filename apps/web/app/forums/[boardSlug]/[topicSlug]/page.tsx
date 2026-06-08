"use client";

/**
 * Topic view page — /forums/[boardSlug]/[topicSlug]
 *
 * Shows a topic header, paginated posts (rendered via MarkdownRenderer),
 * and a reply form (for authenticated members on unlocked topics).
 *
 * Security:
 * - All post bodies render ONLY through MarkdownRenderer (sanitized).
 *   No dangerouslySetInnerHTML on raw user content.
 * - @username mentions in rendered bodies appear as safe links to
 *   /users/<encodeURIComponent(username)> — not injected as HTML.
 * - Moderator controls are client-gated via resolveProtectedSession() +
 *   hasGlobalRole; the ST6 API is the real enforcement boundary.
 * - Quoted post content is fetched through the same gated listPosts API;
 *   if the quoted post is unavailable (e.g. deleted), we degrade gracefully
 *   and show only the reference without leaking content.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  listCategories,
  listTopics,
  listPosts,
  createPost,
  pinTopic,
  unpinTopic,
  lockTopic,
  unlockTopic,
  moveTopic,
  type PublicBoardShape,
  type PublicTopicShape,
  type PaginatedPostsShape,
  type PublicPostShape,
  type ModeratedTopicShape
} from "../../forums-client";
import { readSession, hasGlobalRole, type SessionPayload } from "../../../auth-client";
import { MarkdownRenderer } from "../../../../components/markdown-renderer";
import { ImageUpload, type ImageUploadResult } from "../../../../components/image-upload";
import { MentionAutocomplete } from "../../../../components/mention-autocomplete";
import styles from "../../forums.module.css";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// PostItem component — renders one post with quote affordance.
// ---------------------------------------------------------------------------
interface PostItemProps {
  post: PublicPostShape;
  allPosts: PublicPostShape[];
  onQuote: (post: PublicPostShape) => void;
  isModerator: boolean;
}

function PostItem({ post, allPosts, onQuote, isModerator }: PostItemProps) {
  // Resolve quoted post from already-loaded posts (same-page quota degrades gracefully).
  const quotedPost = post.quotedPostId
    ? allPosts.find((p) => p.id === post.quotedPostId) ?? null
    : null;

  return (
    <li className={styles.postItem} aria-label={`Post by ${post.author.username}`}>
      {/* Quote block — rendered only when the quoted post is available in the current page */}
      {post.quotedPostId ? (
        <div className={styles.postQuote} aria-label="Quoted post">
          <p className={styles.postQuoteLabel}>Quoting</p>
          {quotedPost ? (
            <MarkdownRenderer content={quotedPost.body} />
          ) : (
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted, #8895a7)" }}>
              (Referenced post is not available on this page.)
            </p>
          )}
        </div>
      ) : null}

      {/* Post body — all user content goes through MarkdownRenderer, never raw HTML */}
      <MarkdownRenderer content={post.body} />

      <p className={styles.postAuthor}>
        <Link
          href={`/users/${encodeURIComponent(post.author.username)}`}
          className={styles.authorLink}
        >
          {post.author.displayName ?? post.author.username}
        </Link>
        {" · "}
        <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString()}</time>
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={styles.quoteButton}
          onClick={() => onQuote(post)}
          aria-label={`Quote post by ${post.author.username}`}
        >
          Quote
        </button>
        {isModerator ? (
          <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted, #8895a7)" }}>
            (ID: {post.id.slice(0, 8)}…)
          </span>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main topic view page
// ---------------------------------------------------------------------------

export default function TopicPage() {
  const params = useParams<{ boardSlug: string; topicSlug: string }>();
  const boardSlug = params?.boardSlug ?? "";
  const topicSlug = params?.topicSlug ?? "";

  const [board, setBoard] = useState<PublicBoardShape | null | undefined>(undefined);
  const [topic, setTopic] = useState<PublicTopicShape | null | undefined>(undefined);
  const [postsData, setPostsData] = useState<PaginatedPostsShape | null>(null);
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reply form state
  const [replyBody, setReplyBody] = useState("");
  const [quotedPost, setQuotedPost] = useState<PublicPostShape | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);

  // Moderation state
  const [modError, setModError] = useState<string | null>(null);
  const [modSuccess, setModSuccess] = useState<string | null>(null);
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [moveDestination, setMoveDestination] = useState("");

  // Load session.
  useEffect(() => {
    let mounted = true;
    void readSession()
      .then((s) => { if (mounted) setSession(s); })
      .catch(() => { if (mounted) setSession(null); });
    return () => { mounted = false; };
  }, []);

  // Resolve board + topic + posts.
  useEffect(() => {
    if (!boardSlug || !topicSlug) return;
    let mounted = true;

    const load = async () => {
      try {
        // Resolve board from category listing.
        const categories = await listCategories();
        let resolvedBoard: PublicBoardShape | null = null;
        for (const cat of categories) {
          const found = cat.boards.find((b) => b.slug === boardSlug);
          if (found) { resolvedBoard = found; break; }
        }
        if (!mounted) return;
        if (!resolvedBoard) {
          setBoard(null);
          return;
        }
        setBoard(resolvedBoard);

        // Resolve topic from topic listing.
        let resolvedTopic: PublicTopicShape | null = null;
        let topicsPage = 1;
        let keepSearching = true;
        while (keepSearching) {
          const td = await listTopics(resolvedBoard.id, { page: topicsPage, pageSize: 100 });
          const found = td.topics.find((t) => t.slug === topicSlug);
          if (found) { resolvedTopic = found; keepSearching = false; }
          else if (td.topics.length < 100 || topicsPage * 100 >= td.total) { keepSearching = false; }
          else { topicsPage++; }
        }

        if (!mounted) return;
        if (!resolvedTopic) {
          setTopic(null);
          return;
        }
        setTopic(resolvedTopic);

        // Load posts.
        const pd = await listPosts(resolvedTopic.id, { page, pageSize: PAGE_SIZE });
        if (mounted) setPostsData(pd);
      } catch {
        if (mounted) setLoadError("Unable to load topic.");
      }
    };

    void load();
    return () => { mounted = false; };
  }, [boardSlug, topicSlug, page]);

  const isModerator = session ? hasGlobalRole(session.user, "moderator") : false;
  const isLocked = topic?.isLocked ?? false;
  const currentPath = `/forums/${encodeURIComponent(boardSlug)}/${encodeURIComponent(topicSlug)}`;

  // Handle image upload — append to reply body.
  const handleImageUpload = useCallback((result: ImageUploadResult) => {
    setReplyBody((prev) => `${prev}\n![${result.altText || result.originalFilename}](${result.url})\n`);
  }, []);

  // Handle quote affordance — prepend quoted text to reply body.
  const handleQuote = useCallback((post: PublicPostShape) => {
    setQuotedPost(post);
    setReplyBody((prev) => {
      const quotedLines = post.body
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
      return `${quotedLines}\n\n${prev}`;
    });
  }, []);

  // Submit reply.
  const handleSubmitReply = async () => {
    if (!topic || !replyBody.trim()) return;
    setSubmitting(true);
    setReplyError(null);
    setReplySuccess(false);
    try {
      const newPost = await createPost(
        topic.id,
        replyBody,
        null,
        quotedPost?.id ?? null
      );
      // Append new post optimistically, then reload from API.
      setPostsData((prev) =>
        prev
          ? { ...prev, posts: [...prev.posts, newPost], total: prev.total + 1 }
          : null
      );
      setReplyBody("");
      setQuotedPost(null);
      setReplySuccess(true);
    } catch (err: unknown) {
      setReplyError(err instanceof Error ? err.message : "Failed to post reply.");
    } finally {
      setSubmitting(false);
    }
  };

  // Moderation handlers — each calls the ST6 API; the API is the enforcement boundary.
  const handlePin = async () => {
    if (!topic) return;
    setModError(null);
    setModSuccess(null);
    try {
      const updated: ModeratedTopicShape = topic.isPinned
        ? await unpinTopic(topic.id)
        : await pinTopic(topic.id);
      setTopic((prev) => prev ? { ...prev, isPinned: updated.isPinned } : prev);
      setModSuccess(updated.isPinned ? "Topic pinned." : "Topic unpinned.");
    } catch (err: unknown) {
      setModError(err instanceof Error ? err.message : "Moderation action failed.");
    }
  };

  const handleLock = async () => {
    if (!topic) return;
    setModError(null);
    setModSuccess(null);
    try {
      const updated: ModeratedTopicShape = topic.isLocked
        ? await unlockTopic(topic.id)
        : await lockTopic(topic.id);
      setTopic((prev) => prev ? { ...prev, isLocked: updated.isLocked } : prev);
      setModSuccess(updated.isLocked ? "Topic locked." : "Topic unlocked.");
    } catch (err: unknown) {
      setModError(err instanceof Error ? err.message : "Moderation action failed.");
    }
  };

  const handleMove = async () => {
    if (!topic || !moveDestination.trim()) return;
    setModError(null);
    setModSuccess(null);
    try {
      await moveTopic(topic.id, moveDestination.trim());
      setModSuccess("Topic moved.");
      setShowMoveForm(false);
      setMoveDestination("");
    } catch (err: unknown) {
      setModError(err instanceof Error ? err.message : "Move failed.");
    }
  };

  // Error / loading states.
  if (loadError) {
    return (
      <div className={styles.container}>
        <Link href="/forums" className={styles.backLink}>← Forums</Link>
        <p className={styles.error} role="alert">{loadError}</p>
      </div>
    );
  }

  if (board === undefined || topic === undefined || postsData === null) {
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

  if (topic === null) {
    return (
      <div className={styles.container}>
        <Link href={`/forums/${encodeURIComponent(boardSlug)}`} className={styles.backLink}>
          ← {board.name}
        </Link>
        <h1 className={styles.heading}>Topic not found</h1>
        <p className={styles.description}>This topic does not exist or has been removed.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(postsData.total / PAGE_SIZE));

  return (
    <div className={styles.container}>
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb">
        <ol className={styles.breadcrumb}>
          <li><Link href="/forums">Forums</Link></li>
          <li className={styles.breadcrumbSep} aria-hidden="true">›</li>
          <li><Link href={`/forums/${encodeURIComponent(boardSlug)}`}>{board.name}</Link></li>
          <li className={styles.breadcrumbSep} aria-hidden="true">›</li>
          <li aria-current="page">{topic.title}</li>
        </ol>
      </nav>

      {/* Topic header */}
      <h1 className={styles.heading}>
        {topic.isPinned ? (
          <span className={styles.pinnedBadge} aria-label="Pinned">Pinned</span>
        ) : null}
        {isLocked ? (
          <span className={styles.lockedBadge} aria-label="Locked">Locked</span>
        ) : null}
        {topic.title}
      </h1>
      <p className={styles.description} style={{ marginBottom: "0.5rem" }}>
        Started by{" "}
        <Link href={`/users/${encodeURIComponent(topic.author.username)}`} className={styles.authorLink}>
          {topic.author.displayName ?? topic.author.username}
        </Link>
        {" · "}
        <time dateTime={topic.createdAt}>{new Date(topic.createdAt).toLocaleDateString()}</time>
      </p>

      {/* Topic opening body rendered via MarkdownRenderer — sanitized */}
      {topic.body ? (
        <div style={{ marginBottom: "1.5rem" }}>
          <MarkdownRenderer content={topic.body} />
        </div>
      ) : null}

      {/* Moderator controls — client-gated; API is the real enforcement boundary */}
      {isModerator ? (
        <div className={styles.moderationBar} aria-label="Moderator controls">
          <button
            type="button"
            className={styles.modButton}
            onClick={() => void handlePin()}
            aria-label={topic.isPinned ? "Unpin topic" : "Pin topic"}
          >
            {topic.isPinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            className={`${styles.modButton}${isLocked ? "" : ` ${styles.modButtonDanger}`}`}
            onClick={() => void handleLock()}
            aria-label={isLocked ? "Unlock topic" : "Lock topic"}
          >
            {isLocked ? "Unlock" : "Lock"}
          </button>
          <button
            type="button"
            className={styles.modButton}
            onClick={() => setShowMoveForm((v) => !v)}
            aria-expanded={showMoveForm}
            aria-label="Move topic to another board"
          >
            Move…
          </button>
          {showMoveForm ? (
            <div className={styles.moveForm}>
              <label htmlFor="mod-move-dest" style={{ fontSize: "0.8rem" }}>
                Destination board ID:
              </label>
              <input
                id="mod-move-dest"
                type="text"
                value={moveDestination}
                onChange={(e) => setMoveDestination(e.target.value)}
                placeholder="Board UUID"
                className={styles.moveInput}
                aria-label="Destination board ID"
              />
              <button
                type="button"
                className={styles.modButton}
                onClick={() => void handleMove()}
                disabled={!moveDestination.trim()}
              >
                Confirm move
              </button>
            </div>
          ) : null}
          {modError ? (
            <p className={styles.error} role="alert" style={{ width: "100%", marginTop: "0.25rem" }}>
              {modError}
            </p>
          ) : null}
          {modSuccess ? (
            <p className={styles.success} role="status" style={{ width: "100%", marginTop: "0.25rem" }}>
              {modSuccess}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Post list */}
      <section aria-label="Replies" style={{ marginTop: "1.5rem" }}>
        <h2 className={styles.subheading}>
          {postsData.total} {postsData.total === 1 ? "reply" : "replies"}
        </h2>

        {postsData.posts.length === 0 ? (
          <p className={styles.description}>No replies yet.</p>
        ) : (
          <ul className={styles.postList}>
            {postsData.posts.map((post) => (
              <PostItem
                key={post.id}
                post={post}
                allPosts={postsData.posts}
                onQuote={handleQuote}
                isModerator={isModerator}
              />
            ))}
          </ul>
        )}

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className={styles.pagination} role="navigation" aria-label="Post pagination">
            <button
              type="button"
              className={styles.pageButton}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
            <button
              type="button"
              className={styles.pageButton}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        ) : null}
      </section>

      {/* Reply form — locked notice or form based on session + lock state */}
      {isLocked ? (
        <p className={styles.lockedNotice} role="status" aria-label="Topic locked notice">
          This topic is locked. No new replies can be posted.
        </p>
      ) : session === undefined ? null : session === null ? (
        <p className={styles.signInPrompt}>
          <Link
            href={`/login?next=${encodeURIComponent(currentPath)}`}
            className={styles.signInLink}
          >
            Sign in to reply
          </Link>
        </p>
      ) : (
        <section className={styles.form} aria-label="Post a reply">
          <h3 className={styles.formTitle}>Post a reply</h3>

          {quotedPost ? (
            <div className={styles.postQuote} aria-label="Selected quote">
              <p className={styles.postQuoteLabel}>Quoting {quotedPost.author.username}</p>
              <MarkdownRenderer content={quotedPost.body} />
              <button
                type="button"
                className={styles.quoteButton}
                onClick={() => {
                  setQuotedPost(null);
                  setReplyBody((prev) => prev.replace(/^(>.*\n)+\n?/, ""));
                }}
                aria-label="Remove quote"
              >
                Remove quote
              </button>
            </div>
          ) : null}

          {/* MentionAutocomplete wraps the textarea with @-mention dropdown */}
          <div>
            <label className={styles.formLabel} htmlFor="reply-body">
              Reply (Markdown supported, @username to mention)
            </label>
            <MentionAutocomplete
              id="reply-body"
              value={replyBody}
              onChange={setReplyBody}
              placeholder="Write your reply…"
              rows={6}
              disabled={submitting}
              aria-label="Reply body"
            />
          </div>

          <div>
            <ImageUpload
              resourceType="forum-post"
              onUpload={handleImageUpload}
              onError={(msg) => setReplyError(msg)}
              disabled={submitting}
              label="Attach image"
            />
          </div>

          {replyError ? (
            <p className={styles.error} role="alert">{replyError}</p>
          ) : null}
          {replySuccess ? (
            <p className={styles.success} role="status">Reply posted.</p>
          ) : null}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.submitButton}
              onClick={() => void handleSubmitReply()}
              disabled={submitting || !replyBody.trim()}
              aria-label="Submit reply"
            >
              {submitting ? "Posting…" : "Post reply"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
