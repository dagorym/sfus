import Link from "next/link";
import { RecentDocActivity } from "../components/recent-doc-activity";
import { RecentForumActivity } from "../components/recent-forum-activity";
import styles from "./page.module.css";

const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

const highlights = [
  {
    title: "Documents wiki",
    body: "A hierarchical wiki with breadcrumb navigation, per-edit revision history, side-by-side diffs, rollback, and soft locking to prevent edit collisions. Staff can create, edit, rename, and soft-delete pages; the full tree is publicly readable."
  },
  {
    title: "Community forums",
    body: "Discuss Star Frontiers in threaded topic boards. Members can create topics and reply; moderators can pin, lock, and move threads. @mentions link to public member profiles."
  },
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
  },
  {
    title: "Public member profiles and avatars",
    body: "Every member gets a public profile page at /users/<username> showing their display name, bio, and avatar. Avatars are uploaded via the media API and linked to the user account."
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
            Milestone 5 brings a full Documents wiki to the Star Frontiers US website — a
            hierarchical page tree with breadcrumb navigation, per-edit revision history,
            side-by-side diffs, rollback, and soft locking, built on top of the community
            forums, blog, standalone pages, media uploads, and dynamic navigation delivered
            in earlier milestones.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/docs">
            Browse the wiki
          </Link>
          <Link className={styles.secondaryAction} href="/forums">
            Visit the forums
          </Link>
        </div>
      </section>

      <section className={styles.grid} aria-label="Milestone 5 highlights">
        {highlights.map((item) => (
          <article className={styles.card} key={item.title}>
            <h3 className={styles.cardTitle}>{item.title}</h3>
            <p className={styles.cardBody}>{item.body}</p>
          </article>
        ))}
      </section>

      <section className={styles.whatsNew} aria-label="What&apos;s new in Milestone 5">
        <h2 className={styles.sectionHeading}>What&apos;s new in Milestone 5</h2>
        <div className={styles.whatsNewGrid}>
          <div className={styles.feedColumn}>
            <h3 className={styles.columnHeading}>Recent document activity</h3>
            <RecentDocActivity />
            <Link href="/docs" className={styles.blogIndexLink}>
              Browse the wiki →
            </Link>
          </div>
          <div className={styles.feedColumn}>
            <h3 className={styles.columnHeading}>Recent forum activity</h3>
            <RecentForumActivity />
            <Link href="/forums" className={styles.blogIndexLink}>
              View the forums →
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.exploreSection} aria-label="Explore the site">
        <h2 className={styles.sectionHeading}>Explore the site</h2>
        <ul className={styles.exploreList}>
          <li>
            <Link href="/docs" className={styles.exploreLink}>
              Documents wiki
            </Link>
            <span className={styles.exploreDesc}> — browse the hierarchical wiki with revision history and breadcrumb navigation</span>
          </li>
          <li>
            <Link href="/forums" className={styles.exploreLink}>
              Forums
            </Link>
            <span className={styles.exploreDesc}> — browse boards and join the discussion</span>
          </li>
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
            <span className={styles.exploreLink}>Member profiles</span>
            <span className={styles.exploreDesc}> — public profile pages at /users/&lt;username&gt; with bio, avatar, and activity</span>
          </li>
        </ul>
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
          <p className={styles.metaValue}>Documents wiki, forums, blog, standalone pages, navigation, and media</p>
          <p className={styles.metaBody}>
            Staff create and maintain a hierarchical Documents wiki with full revision history,
            diffs, rollback, and soft locking. Members participate in forum discussions and leave
            threaded blog comments. Admins publish posts and standalone pages, manage site
            navigation, and attach images via the media upload API. Moderators and admins keep
            content clean across the wiki, forums, and blog.
          </p>
        </article>
      </section>
    </div>
  );
}
