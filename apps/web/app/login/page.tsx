import Link from "next/link";

import styles from "../auth-shell.module.css";

const providers = [
  { key: "google", label: "Continue with Google" },
  { key: "github", label: "Continue with GitHub" }
];

export default function LoginPage() {
  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>External Authentication</p>
      <h2 className={styles.title}>Sign in to your command deck.</h2>
      <p className={styles.description}>
        Use Google or GitHub to authenticate. New external accounts will complete username
        onboarding before entering the authenticated shell.
      </p>
      <div className={styles.actions}>
        {providers.map((provider) => (
          <a
            className={styles.action}
            href={`/api/auth/external/${provider.key}/start?next=%2Fapp`}
            key={provider.key}
          >
            {provider.label}
          </a>
        ))}
        <Link className={styles.secondaryAction} href="/">
          Return to public shell
        </Link>
      </div>
    </section>
  );
}
