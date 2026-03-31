import Link from "next/link";
import styles from "./page.module.css";

const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

const highlights = [
  {
    title: "Static public landing page",
    body: "The first-release homepage stays fast, stable, and entirely content-driven without depending on live API data."
  },
  {
    title: "Responsive shared shell",
    body: "Header, navigation, content framing, and footer all adapt across phone, tablet, and desktop breakpoints."
  },
  {
    title: "Single-theme token system",
    body: "Global CSS custom properties define the Milestone 1 color, spacing, and elevation language without introducing a UI package."
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
            This Milestone 1 shell establishes the branded public homepage, shared layout, and
            local-to-production API path contract that future gameplay features can build on.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/">
            Explore the public shell
          </Link>
          <a className={styles.secondaryAction} href={`${apiBasePath}/health/live`}>
            Check API liveness path
          </a>
        </div>
      </section>

      <section className={styles.grid} aria-label="Frontend foundations">
        {highlights.map((item) => (
          <article className={styles.card} key={item.title}>
            <h3 className={styles.cardTitle}>{item.title}</h3>
            <p className={styles.cardBody}>{item.body}</p>
          </article>
        ))}
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
          <p className={styles.metaLabel}>Current navigation scope</p>
          <p className={styles.metaValue}>Implemented destinations only</p>
          <p className={styles.metaBody}>
            Auth controls, speculative routes, and future feature placeholders are intentionally
            absent from this foundation release.
          </p>
        </article>
      </section>
    </div>
  );
}
