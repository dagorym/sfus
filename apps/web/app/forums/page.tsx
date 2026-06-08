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
            <ul className={styles.boardList}>
              {category.boards.map((board) => (
                <li key={board.id} className={styles.boardItem}>
                  <Link
                    href={`/forums/${encodeURIComponent(board.slug)}`}
                    className={styles.boardLink}
                  >
                    <p className={styles.boardName}>{board.name}</p>
                    {board.description ? (
                      <p className={styles.boardDescription}>{board.description}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
