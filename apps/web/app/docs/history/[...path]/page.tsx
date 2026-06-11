"use client";

/**
 * /docs/history/[...path] — Revision history, side-by-side diff, and rollback.
 *
 * URL pattern: /docs/history/some/path/to/page
 *
 * This page:
 *  1. Resolves the doc page by path to get its ID.
 *  2. Fetches the full revision history list from GET /api/docs/:id/history.
 *  3. Lets the user pick two revisions to compare (from/to selectors).
 *  4. Renders the server-computed diff side-by-side (added/removed/unchanged).
 *  5. For staff (moderator/admin) only: shows a rollback button per revision.
 *
 * Non-staff users see the history and diff but no rollback affordances.
 * The server gate enforces authorization on rollback; client gating is
 * defense-in-depth only.
 *
 * Diff size cap (DOCS_DIFF_MAX_BODY_BYTES / DOCS_DIFF_MAX_LINES): when the
 * server returns 400 for oversized revisions, a friendly message is shown
 * rather than a crash.
 */

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

import {
  getDocPageByPath,
  getDocHistory,
  getDocDiff,
  rollbackDocPage,
  type DocsPageShape,
  type DocsRevisionMetaShape,
  type DocsDiffShape,
  type DocsDiffHunk,
} from "../../docs-client";
import { readSession, hasGlobalRole, type SessionPayload } from "../../../auth-client";
import styles from "../../docs.module.css";

// ---------------------------------------------------------------------------
// Side-by-side diff renderer
// ---------------------------------------------------------------------------

interface DiffRowProps {
  leftLineNum: number | null;
  leftContent: string | null;
  rightLineNum: number | null;
  rightContent: string | null;
  rowClass: string;
}

function DiffRow({ leftLineNum, leftContent, rightLineNum, rightContent, rowClass }: DiffRowProps) {
  return (
    <tr className={rowClass}>
      <td className={styles.diffLineGutter}>{leftLineNum ?? ""}</td>
      <td>{leftContent ?? ""}</td>
      <td className={styles.diffLineDivider} />
      <td className={styles.diffLineGutter}>{rightLineNum ?? ""}</td>
      <td>{rightContent ?? ""}</td>
    </tr>
  );
}

interface SideBySideDiffProps {
  diff: DocsDiffShape;
  fromLabel: string;
  toLabel: string;
}

function SideBySideDiff({ diff, fromLabel, toLabel }: SideBySideDiffProps) {
  // Build rows from hunks
  const rows: React.ReactNode[] = [];
  let leftLine = 1;
  let rightLine = 1;

  diff.hunks.forEach((hunk: DocsDiffHunk, hunkIdx: number) => {
    if (hunk.type === "unchanged") {
      hunk.lines.forEach((line, i) => {
        rows.push(
          <DiffRow
            key={`unchanged-${hunkIdx}-${i}`}
            leftLineNum={leftLine}
            leftContent={line}
            rightLineNum={rightLine}
            rightContent={line}
            rowClass={styles.diffLineUnchanged}
          />
        );
        leftLine++;
        rightLine++;
      });
    } else if (hunk.type === "removed") {
      hunk.lines.forEach((line, i) => {
        rows.push(
          <DiffRow
            key={`removed-${hunkIdx}-${i}`}
            leftLineNum={leftLine}
            leftContent={line}
            rightLineNum={null}
            rightContent={null}
            rowClass={styles.diffLineRemoved}
          />
        );
        leftLine++;
      });
    } else if (hunk.type === "added") {
      hunk.lines.forEach((line, i) => {
        rows.push(
          <DiffRow
            key={`added-${hunkIdx}-${i}`}
            leftLineNum={null}
            leftContent={null}
            rightLineNum={rightLine}
            rightContent={line}
            rowClass={styles.diffLineAdded}
          />
        );
        rightLine++;
      });
    }
  });

  return (
    <div className={styles.diffContainer}>
      <table className={styles.diffTable} aria-label="Side-by-side diff">
        <thead>
          <tr className={styles.diffHeaderRow}>
            <th colSpan={2}>{fromLabel}</th>
            <th />
            <th colSpan={2}>{toLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: "1rem", color: "var(--color-text-muted)" }}>
                No differences — revisions are identical.
              </td>
            </tr>
          ) : (
            rows
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DocsHistoryPage() {
  const params = useParams<{ path: string[] }>();
  const pathSegments = params?.path ?? [];
  const fullPath = pathSegments.join("/");

  // Page / session / history state
  const [page, setPage] = useState<DocsPageShape | null | undefined>(undefined);
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);
  const [history, setHistory] = useState<DocsRevisionMetaShape[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Diff state
  const [fromRev, setFromRev] = useState<number | null>(null);
  const [toRev, setToRev] = useState<number | null>(null);
  const [diff, setDiff] = useState<DocsDiffShape | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Rollback state
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rollbackSuccess, setRollbackSuccess] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Load page + session + history
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!fullPath) return;
    let mounted = true;

    const load = async () => {
      try {
        const [fetched, sess] = await Promise.all([
          getDocPageByPath(fullPath),
          readSession().catch(() => null as SessionPayload | null),
        ]);
        if (!mounted) return;

        setPage(fetched);
        setSession(sess);

        if (!fetched) return; // 404 — history also won't be available

        const hist = await getDocHistory(fetched.id);
        if (!mounted) return;
        setHistory(hist);

        // Pre-select from/to as (latest-1, latest) if two or more revisions exist
        if (hist && hist.length >= 2) {
          const sorted = [...hist].sort((a, b) => a.revisionNumber - b.revisionNumber);
          setFromRev(sorted[sorted.length - 2].revisionNumber);
          setToRev(sorted[sorted.length - 1].revisionNumber);
        } else if (hist && hist.length === 1) {
          setFromRev(hist[0].revisionNumber);
          setToRev(hist[0].revisionNumber);
        }
      } catch (err) {
        if (mounted)
          setLoadError(err instanceof Error ? err.message : "Failed to load document history.");
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [fullPath]);

  // ------------------------------------------------------------------
  // Load diff when from/to selection changes
  // ------------------------------------------------------------------

  const loadDiff = useCallback(
    async (pageId: string, from: number, to: number) => {
      setDiffLoading(true);
      setDiffError(null);
      setDiff(null);
      try {
        const result = await getDocDiff(pageId, from, to);
        setDiff(result);
      } catch (err) {
        setDiffError(err instanceof Error ? err.message : "Failed to load diff.");
      } finally {
        setDiffLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (page && page.id && fromRev !== null && toRev !== null) {
      void loadDiff(page.id, fromRev, toRev);
    }
  }, [page, fromRev, toRev, loadDiff]);

  // ------------------------------------------------------------------
  // Rollback handler
  // ------------------------------------------------------------------

  const handleRollback = async (revisionNumber: number) => {
    if (!page) return;
    setRollingBack(revisionNumber);
    setRollbackError(null);
    setRollbackSuccess(null);
    try {
      const updated = await rollbackDocPage(page.id, revisionNumber);
      setPage(updated);
      // Reload history to reflect the new rollback revision
      const hist = await getDocHistory(page.id);
      setHistory(hist);
      if (hist) {
        const sorted = [...hist].sort((a, b) => a.revisionNumber - b.revisionNumber);
        const latest = sorted[sorted.length - 1];
        setRollbackSuccess(
          `Rolled back to revision ${revisionNumber}. New revision: #${latest.revisionNumber}.`
        );
        // Update diff selectors to show the rollback result
        setFromRev(revisionNumber);
        setToRev(latest.revisionNumber);
      }
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : "Failed to roll back document.");
    } finally {
      setRollingBack(null);
    }
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const isStaff =
    session != null &&
    session !== undefined &&
    hasGlobalRole(session.user, "moderator");

  function formatRevisionLabel(rev: DocsRevisionMetaShape): string {
    const who = rev.editorUsername ?? rev.author?.displayName ?? rev.author?.username ?? "unknown";
    const when = new Date(rev.createdAt).toLocaleDateString();
    return `Rev #${rev.revisionNumber} by ${who} on ${when}`;
  }

  // ------------------------------------------------------------------
  // Render: loading
  // ------------------------------------------------------------------

  if (page === undefined) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents · History</p>
        <h1 className={styles.heading}>Loading…</h1>
        <p className={styles.description}>Retrieving document history.</p>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Render: load error
  // ------------------------------------------------------------------

  if (loadError) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents · History</p>
        <h1 className={styles.heading}>Error</h1>
        <p className={styles.error} role="alert">{loadError}</p>
        <div style={{ marginTop: "1rem" }}>
          <Link href="/docs" className={styles.secondaryActionButton}>
            Back to Documents
          </Link>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Render: not found (null = 404, no oracle distinction)
  // ------------------------------------------------------------------

  if (page === null) {
    return (
      <section className={styles.container}>
        <p className={styles.eyebrow}>Documents · History</p>
        <h1 className={styles.heading}>Document not found.</h1>
        <p className={styles.description}>
          This document does not exist or is not publicly accessible.
        </p>
        <div style={{ marginTop: "1rem" }}>
          <Link href="/docs" className={styles.secondaryActionButton}>
            Back to Documents
          </Link>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------------
  // Render: history + diff
  // ------------------------------------------------------------------

  const sortedHistory = history
    ? [...history].sort((a, b) => b.revisionNumber - a.revisionNumber)
    : null;

  return (
    <article className={styles.container}>
      <p className={styles.eyebrow}>Documents · History</p>
      <h1 className={styles.heading}>{page.title}</h1>

      <div style={{ marginBottom: "0.5rem" }}>
        <Link href={`/docs/${fullPath}`} className={styles.secondaryActionButton}>
          ← Back to document
        </Link>
      </div>

      {/* Rollback feedback */}
      {rollbackSuccess ? (
        <p className={styles.saveSuccess} role="status">{rollbackSuccess}</p>
      ) : null}
      {rollbackError ? (
        <p className={styles.error} role="alert">{rollbackError}</p>
      ) : null}

      {/* Revision history list */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.75rem" }}>
          Revision History
        </h2>
        {sortedHistory === null ? (
          <p className={styles.description}>Loading history…</p>
        ) : sortedHistory.length === 0 ? (
          <p className={styles.description}>No revisions recorded for this page.</p>
        ) : (
          <ol className={styles.historyList} reversed>
            {sortedHistory.map((rev) => {
              const authorDisplay =
                rev.author?.displayName ?? rev.author?.username ?? "unknown";
              const editorDisplay = rev.editorUsername ?? null;
              const when = new Date(rev.createdAt).toLocaleString();
              return (
                <li key={rev.revisionNumber} className={styles.historyItem}>
                  <span className={styles.historyRevNum}>#{rev.revisionNumber}</span>
                  <span className={styles.historyMeta}>
                    by {editorDisplay ?? authorDisplay} · {when}
                  </span>
                  {rev.summary ? (
                    <span className={styles.historySummary}>{rev.summary}</span>
                  ) : null}
                  <span className={styles.historyActions}>
                    {isStaff ? (
                      <button
                        type="button"
                        className={`${styles.historyActionBtn} ${styles.historyActionBtnDanger}`}
                        disabled={rollingBack !== null}
                        onClick={() => void handleRollback(rev.revisionNumber)}
                        aria-label={`Roll back to revision ${rev.revisionNumber}`}
                      >
                        {rollingBack === rev.revisionNumber ? "Rolling back…" : "Roll back"}
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Diff selector + view */}
      {sortedHistory !== null && sortedHistory.length >= 1 ? (
        <section aria-labelledby="diff-heading" style={{ marginTop: "2rem" }}>
          <h2 id="diff-heading" style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.75rem" }}>
            Compare Revisions
          </h2>

          <div className={styles.diffControls}>
            <div className={styles.diffControlGroup}>
              <label htmlFor="diff-from" className={styles.diffControlLabel}>
                From (older)
              </label>
              <select
                id="diff-from"
                className={styles.diffSelect}
                value={fromRev ?? ""}
                onChange={(e) => setFromRev(Number(e.target.value))}
                disabled={sortedHistory.length < 2}
              >
                {[...sortedHistory]
                  .sort((a, b) => a.revisionNumber - b.revisionNumber)
                  .map((rev) => (
                    <option key={rev.revisionNumber} value={rev.revisionNumber}>
                      {formatRevisionLabel(rev)}
                    </option>
                  ))}
              </select>
            </div>

            <div className={styles.diffControlGroup}>
              <label htmlFor="diff-to" className={styles.diffControlLabel}>
                To (newer)
              </label>
              <select
                id="diff-to"
                className={styles.diffSelect}
                value={toRev ?? ""}
                onChange={(e) => setToRev(Number(e.target.value))}
                disabled={sortedHistory.length < 2}
              >
                {[...sortedHistory]
                  .sort((a, b) => a.revisionNumber - b.revisionNumber)
                  .map((rev) => (
                    <option key={rev.revisionNumber} value={rev.revisionNumber}>
                      {formatRevisionLabel(rev)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: "1rem" }}>
            {diffLoading ? (
              <p className={styles.description}>Loading diff…</p>
            ) : diffError ? (
              <p className={styles.error} role="alert">{diffError}</p>
            ) : diff ? (
              <SideBySideDiff
                diff={diff}
                fromLabel={`Revision #${diff.fromRevisionNumber}`}
                toLabel={`Revision #${diff.toRevisionNumber}`}
              />
            ) : sortedHistory.length >= 2 ? (
              <p className={styles.description}>Select two revisions to compare.</p>
            ) : (
              <p className={styles.description}>
                Only one revision exists — nothing to compare yet.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </article>
  );
}
