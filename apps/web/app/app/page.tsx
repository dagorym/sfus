"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { readSession, type SessionPayload } from "../auth-client";
import styles from "../auth-shell.module.css";

export default function AuthenticatedShellPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resolved = await readSession();
        if (!mounted) {
          return;
        }
        if (!resolved) {
          router.replace("/login");
          return;
        }
        if (resolved.user.onboardingRequired) {
          router.replace("/onboarding/username");
          return;
        }
        setSession(resolved);
      } catch {
        if (mounted) {
          setError("Unable to load your authenticated session.");
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (error) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Authenticated Shell</p>
        <h2 className={styles.title}>Session load failed.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Authenticated Shell</p>
        <h2 className={styles.title}>Preparing command deck…</h2>
        <p className={styles.status}>Validating your current auth session.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Authenticated Shell</p>
      <h2 className={styles.title}>Welcome back, {session.user.username}.</h2>
      <p className={styles.description}>
        You are signed in as <strong>{session.user.email}</strong> and have passed first-login
        onboarding.
      </p>
      <div className={styles.actions}>
        <Link className={styles.secondaryAction} href="/">
          Return to public shell
        </Link>
      </div>
    </section>
  );
}
