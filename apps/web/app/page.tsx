import Link from "next/link";
import { RecentPostsFeed } from "../components/recent-posts-feed";
import styles from "./page.module.css";

const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

const highlights = [
  {
    title: "Blog with threaded comments",
    body: "Publish posts with Markdown bodies, featured images, tags, and pinning. Authenticated members can leave threaded replies; moderators and admins can hide or remove comments."
  },
  {
    title: "Standalone pages and revision history",
    body: "Create admin-managed site pages such as About or Rules at any slug. Every save creates a revisioned snapshot that can be previewed and restored at any time."
  },
  {
    title: "Dynamic navigation and media uploads",
    body: "Admins control site navigation in real time through the navigation manager. Images can be attached to posts, pages, and comments via the media upload widget."
  }
];

export default function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Public Landing Experience</p>
          <h2 className={styles.title}>Chart the next frontier for Star Frontiers US.</h2>
          <p className={styles.description}>
            Milestone 3 brings a full content platform to the Star Frontiers US website — blog posts,
            standalone pages, media uploads, dynamic navigation, and threaded comments, all built on
            the shared API path contract.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/blog">
            Read the blog
          </Link>
          <a className={styles.secondaryAction} href={`${apiBasePath}/health/live`}>
            Check API liveness path
          </a>
        </div>
      </section>

      <section className={styles.grid} aria-label="Milestone 3 highlights">
        {highlights.map((item) => (
          <article className={styles.card} key={item.title}>
            <h3 className={styles.cardTitle}>{item.title}</h3>
            <p className={styles.cardBody}>{item.body}</p>
          </article>
        ))}
      </section>

      <section className={styles.whatsNew} aria-label="What's new in Milestone 3">
        <h2 className={styles.sectionHeading}>What's new in Milestone 3</h2>
        <div className={styles.whatsNewGrid}>
          <div className={styles.feedColumn}>
            <h3 className={styles.columnHeading}>Recent posts</h3>
            <RecentPostsFeed />
            <Link href="/blog" className={styles.blogIndexLink}>
              View all posts →
            </Link>
          </div>
          <div className={styles.linksColumn}>
            <h3 className={styles.columnHeading}>Explore the site</h3>
            <ul className={styles.exploreList}>
              <li>
                <Link href="/blog" className={styles.exploreLink}>
                  Blog index
                </Link>
                <span className={styles.exploreDesc}> — browse all published posts</span>
              </li>
              <li>
                <Link href="/about" className={styles.exploreLink}>
                  About
                </Link>
                <span className={styles.exploreDesc}> — standalone page at /about (published by admin)</span>
              </li>
              <li>
                <span className={styles.exploreLink}>Navigation</span>
                <span className={styles.exploreDesc}> — admins can manage site nav items in real time at{" "}
                  <Link href="/admin/navigation" className={styles.inlineLink}>/admin/navigation</Link>
                </span>
              </li>
              <li>
                <span className={styles.exploreLink}>Comments</span>
                <span className={styles.exploreDesc}> — threaded replies on any published blog post; moderated by site staff</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.metaRow} aria-label="Runtime notes">
        <article className={styles.metaCard}>
          <p className={styles.metaLabel}>Frontend to API contract</p>
          <p className={styles.metaValue}>
            Target <span className={styles.inlineCode}>{apiBasePath}</span> everywhere.
          </p>
          <p className={styles.metaBody}>
            Local development rewrites can forward that shared path to the host-run API on port
            3001, while production stays on the canonical public origin.
          </p>
        </article>
        <article className={styles.metaCard}>
          <p className={styles.metaLabel}>Current content scope</p>
          <p className={styles.metaValue}>Blog, standalone pages, navigation, and media</p>
          <p className={styles.metaBody}>
            Admins publish blog posts and standalone pages, manage site navigation, and attach
            images via the media upload API. Authenticated members can leave threaded comments.
          </p>
        </article>
      </section>
    </div>
  );
}
