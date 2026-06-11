"use client";

/**
 * Forum index page — /forums
 *
 * Lists all forum categories with their publicly-readable site boards.
 * Only site-scoped, publicly-readable boards are shown (the API enforces this).
 * No authentication required — this is a public read surface.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { listCategories, type PublicCategoryShape } from "./forums-client";
import styles from "./forums.module.css";

export default function ForumsIndexPage() {
  const [categories, setCategories] = useState<PublicCategoryShape[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const cats = await listCategories();
        if (mounted) setCategories(cats);
      } catch {
        if (mounted) setError("Unable to load forum categories.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.eyebrow}>Community Forums</p>
        <h1 className={styles.heading}>Forums</h1>
        <p className={styles.error} role="alert">{error}</p>
      </div>
    );
  }

  if (categories === null) {
    return (
      <div className={styles.container}>
        <p className={styles.eyebrow}>Community Forums</p>
        <h1 className={styles.heading}>Forums</h1>
        <p className={styles.description}>Loading…</p>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.eyebrow}>Community Forums</p>
        <h1 className={styles.heading}>Forums</h1>
        <p className={styles.description}>No forum boards are available yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <p className={styles.eyebrow}>Community Forums</p>
      <h1 className={styles.heading}>Forums</h1>
      {categories.map((category) => (
        <section key={category.id} className={styles.categorySection} aria-label={category.name}>
          <div className={styles.categoryHeader}>
            <h2 className={styles.categoryTitle}>{category.name}</h2>
            {category.description ? (
              <p className={styles.boardDescription}>{category.description}</p>
            ) : null}
          </div>
          {category.boards.length === 0 ? (
            <p className={styles.description} style={{ padding: "0.75rem 1rem" }}>
              No boards in this category.
            </p>
          ) : (
            <table className={styles.boardTable}>
              <thead>
                <tr>
                  <th className={styles.boardTableHeaderBoard} scope="col">Board</th>
                  <th className={styles.boardTableHeaderStat} scope="col">Topics</th>
                  <th className={styles.boardTableHeaderStat} scope="col">Posts</th>
                  <th className={styles.boardTableHeaderLastPost} scope="col">Last Post</th>
                </tr>
              </thead>
              <tbody>
                {category.boards.map((board) => (
                  <tr key={board.id} className={styles.boardRow}>
                    <td className={styles.boardCellName}>
                      <Link
                        href={`/forums/${encodeURIComponent(board.slug)}`}
                        className={styles.boardLink}
                      >
                        <p className={styles.boardName}>{board.name}</p>
                        {board.description ? (
                          <p className={styles.boardDescription}>{board.description}</p>
                        ) : null}
                      </Link>
                    </td>
                    <td className={styles.boardCellStat}>{board.topicCount}</td>
                    <td className={styles.boardCellStat}>{board.postCount}</td>
                    <td className={styles.boardCellLastPost}>
                      {board.lastPost === null ? (
                        <span className={styles.noPostsYet}>No posts yet</span>
                      ) : (
                        <>
                          <span className={styles.lastPostDate}>
                            {new Date(board.lastPost.at).toLocaleDateString()}
                          </span>
                          {" by "}
                          <Link
                            href={`/users/${encodeURIComponent(board.lastPost.author.username)}`}
                            className={styles.authorLink}
                          >
                            {board.lastPost.author.displayName ?? board.lastPost.author.username}
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
