import Link from "next/link";
import styles from "./page-state.module.css";

type PageStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref?: string;
  primaryAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export function PageState({
  eyebrow,
  title,
  description,
  primaryLabel,
  primaryHref,
  primaryAction,
  secondaryLabel,
  secondaryHref
}: PageStateProps) {
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.description}>{description}</p>
      <div className={styles.actions}>
        {primaryHref ? (
          <Link className={styles.action} href={primaryHref}>
            {primaryLabel}
          </Link>
        ) : (
          <button className={styles.action} onClick={primaryAction} type="button">
            {primaryLabel}
          </button>
        )}
        {secondaryLabel && secondaryHref ? (
          <Link className={styles.secondaryAction} href={secondaryHref}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
