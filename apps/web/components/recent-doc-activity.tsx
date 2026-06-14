"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRecentDocEdits, type DocsRecentEditShape } from "../app/docs/docs-client";
import styles from "./recent-doc-activity.module.css";

export function RecentDocActivity() {
  const [edits, setEdits] = useState<DocsRecentEditShape[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecentDocEdits(5)
      .then((all) => setEdits(all))
      .catch(() => setError("Could not load recent document activity."));
  }, []);

  if (error !== null) {
    return <p className={styles.feedNote}>{error}</p>;
  }

  if (edits === null) {
    return <p className={styles.feedNote}>Loading recent document activity…</p>;
  }

  if (edits.length === 0) {
    return <p className={styles.feedNote}>No document activity yet.</p>;
  }

  return (
    <ul className={styles.feedList}>
      {edits.map((edit) => (
        <li key={edit.pageId} className={styles.feedItem}>
          <Link
            href={`/docs/${edit.path}`}
            className={styles.feedTitle}
          >
            {edit.title}
          </Link>
          <p className={styles.feedMeta}>
            {edit.editor
              ? (edit.editor.displayName ?? edit.editor.username)
              : "Unknown editor"}
            {" · "}
            {new Date(edit.editedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric"
            })}
          </p>
        </li>
      ))}
    </ul>
  );
}
