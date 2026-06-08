"use client";

/**
 * Board view page — /forums/[boardSlug]
 *
 * Shows a paginated list of topics in a publicly-readable board.
 * Pinned topics are listed first, then by most-recently active.
 * No authentication required for browsing.
 * A link to create a new topic is shown for authenticated members;
 * guests see a sign-in prompt with the current path preserved as ?next=.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  listCategories,
  listTopics,
  type PublicBoardShape,
  type PaginatedTopicsShape
} from "../forums-client";
import { readSession, type SessionPayload, hasGlobalRole } from "../../auth-client";
import styles from "../forums.module.css";

const PAGE_SIZE = 20;

export default function BoardPage() {
  const params = useParams<{ boardSlug: string }>();
  const boardSlug = params?.boardSlug ?? "";

  const [board, setBoard] = useState<PublicBoardShape | null | undefined>(undefined);
  const [topicsData, setTopicsData] = useState<PaginatedTopicsShape | null>(null);
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Load session independently.
  useEffect(() => {
    let mounted = true;
    void readSession()
      .then((s) => { if (mounted) setSession(s); })
      .catch(() => { if (mounted) setSession(null); });
    return () => { mounted = false; };
  }, []);

  // Resolve board id from slug via category listing, then load topics.
  useEffect(() => {
    if (!boardSlug) return;
    let mounted = true;

    const load = async () => {
      try {
        // Resolve board from category listing (the public read API already filters to site boards).
        const categories = await listCategories();
        let resolvedBoard: PublicBoardShape | null = null;
        for (const cat of categories) {
          const found = cat.boards.find((b) => b.slug === boardSlug);
          if (found) {
            resolvedBoard = found;
            break;
          }
        }

        if (!mounted) return;
        if (!resolvedBoard) {
          setBoard(null);
          return;
        }
        setBoard(resolvedBoard);

        // Load topics for this board.
        const data = await listTopics(resolvedBoard.id, { page, pageSize: PAGE_SIZE });
        if (mounted) setTopicsData(data);
      } catch {
        if (mounted) setError("Unable to load board.");
      }
    };

    void load();
    return () => { mounted = false; };
  }, [boardSlug, page]);

  const currentPath = `/forums/${encodeURIComponent(boardSlug)}`;
  const isModerator = session ? hasGlobalRole(session.user, "moderator") : false;

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.eyebrow}>Forums</p>
        <p className={styles.error} role="alert">{error}</p>
        <Link href="/forums" className={styles.backLink}>← Forums</Link>
      </div>
    );
  }

  if (board === undefined || topicsData === null) {
    return (
      <div className={styles.container}>
        <p className={styles.eyebrow}>Forums</p>
        <p className={styles.description}>Loading…</p>
      </div>
    );
  }

  if (board === null) {
    return (
      <div className={styles.container}>
        <nav aria-label="breadcrumb">
          <ol className={styles.breadcrumb}>
            <li><Link href="/forums">Forums</Link></li>
            <li className={styles.breadcrumbSep} aria-hidden="true">›</li>
            <li aria-current="page">Board not found</li>
          </ol>
        </nav>
        <h1 className={styles.heading}>Board not found</h1>
        <p className={styles.description}>This board does not exist or is not publicly accessible.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(topicsData.total / PAGE_SIZE));

  return (
    <div className={styles.container}>
      <nav aria-label="breadcrumb">
        <ol className={styles.breadcrumb}>
          <li><Link href="/forums">Forums</Link></li>
          <li className={styles.breadcrumbSep} aria-hidden="true">›</li>
          <li aria-current="page">{board.name}</li>
        </ol>
      </nav>

      <h1 className={styles.heading}>{board.name}</h1>
      {board.description ? (
        <p className={styles.description} style={{ marginBottom: "1rem" }}>
          {board.description}
        </p>
      ) : null}

      {/* Moderator note — for clarity only, real gate is the API */}
      {isModerator ? (
        <p style={{ fontSize: "0.78rem", color: "var(--color-accent-strong, #7aa2ff)", marginBottom: "0.5rem" }}>
          You have moderator access on this board.
        </p>
      ) : null}

      {topicsData.topics.length === 0 ? (
        <p className={styles.description}>No topics yet. Be the first to post.</p>
      ) : (
        <ul className={styles.topicList} aria-label="Topics">
          {topicsData.topics.map((topic) => (
            <li key={topic.id} className={styles.topicItem}>
              <Link
                href={`/forums/${encodeURIComponent(boardSlug)}/${encodeURIComponent(topic.slug)}`}
                className={styles.topicLink}
              >
                <p className={styles.topicTitle}>
                  {topic.isPinned ? (
                    <span className={styles.pinnedBadge} aria-label="Pinned">Pinned</span>
                  ) : null}
                  {topic.isLocked ? (
                    <span className={styles.lockedBadge} aria-label="Locked">Locked</span>
                  ) : null}
                  {topic.title}
                </p>
                <p className={styles.topicMeta}>
                  by {topic.author.displayName ?? topic.author.username}
                  {" · "}
                  {topic.replyCount} {topic.replyCount === 1 ? "reply" : "replies"}
                  {topic.lastPostAt ? (
                    <> · Last post {new Date(topic.lastPostAt).toLocaleDateString()}</>
                  ) : null}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className={styles.pagination} role="navigation" aria-label="Topic pagination">
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Previous page"
          >
            ← Prev
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
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

      {/* Create topic — authenticated members only */}
      {session === undefined ? null : session === null ? (
        <p className={styles.signInPrompt}>
          <Link
            href={`/login?next=${encodeURIComponent(`${currentPath}/new-topic`)}`}
            className={styles.signInLink}
          >
            Sign in to create a topic
          </Link>
        </p>
      ) : (
        <div style={{ marginTop: "1.5rem" }}>
          <Link
            href={`/forums/${encodeURIComponent(boardSlug)}/new-topic`}
            className={styles.signInLink}
            style={{ fontWeight: 700 }}
          >
            + New Topic
          </Link>
        </div>
      )}
    </div>
  );
}
