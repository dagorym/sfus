"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listRecentTopics, type RecentTopicItem } from "../app/forums/forums-client";
import styles from "./recent-forum-activity.module.css";

export function RecentForumActivity() {
  const [topics, setTopics] = useState<RecentTopicItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRecentTopics({ limit: 5 })
      .then((all) => setTopics(all))
      .catch(() => setError("Could not load recent forum activity."));
  }, []);

  if (error !== null) {
    return <p className={styles.feedNote}>{error}</p>;
  }

  if (topics === null) {
    return <p className={styles.feedNote}>Loading recent forum activity…</p>;
  }

  if (topics.length === 0) {
    return <p className={styles.feedNote}>No forum activity yet.</p>;
  }

  return (
    <ul className={styles.feedList}>
      {topics.map((topic) => (
        <li key={topic.id} className={styles.feedItem}>
          <Link
            href={`/forums/${encodeURIComponent(topic.board.slug)}/${encodeURIComponent(topic.slug)}`}
            className={styles.feedTitle}
          >
            {topic.title}
          </Link>
          <p className={styles.feedMeta}>
            {topic.board.name}
            {" · "}
            {topic.author.displayName ?? topic.author.username}
            {topic.lastPostAt && (
              <>
                {" · "}
                {new Date(topic.lastPostAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric"
                })}
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
