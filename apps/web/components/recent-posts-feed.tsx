"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listPublishedPosts, type BlogPostSummary } from "../app/blog/blog-client";
import styles from "./recent-posts-feed.module.css";

export function RecentPostsFeed() {
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPublishedPosts()
      .then((all) => setPosts(all.slice(0, 3)))
      .catch(() => setError("Could not load recent posts."));
  }, []);

  if (error !== null) {
    return <p className={styles.feedNote}>{error}</p>;
  }

  if (posts === null) {
    return <p className={styles.feedNote}>Loading recent posts…</p>;
  }

  if (posts.length === 0) {
    return <p className={styles.feedNote}>No posts yet.</p>;
  }

  return (
    <ul className={styles.feedList}>
      {posts.map((post) => (
        <li key={post.id} className={styles.feedItem}>
          <Link href={`/blog/${post.slug}`} className={styles.feedTitle}>
            {post.title}
          </Link>
          {post.summary && <p className={styles.feedSummary}>{post.summary}</p>}
          {post.publishedAt && (
            <p className={styles.feedDate}>
              {new Date(post.publishedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric"
              })}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
