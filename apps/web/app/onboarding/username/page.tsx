"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { readSession, type SessionPayload } from "../../auth-client";
import styles from "../../auth-shell.module.css";

export default function UsernameOnboardingPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        if (!resolved.user.onboardingRequired) {
          router.replace("/app");
          return;
        }
        setSession(resolved);
      } catch {
        if (mounted) {
          setError("Unable to load onboarding session.");
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/onboarding/username", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          username
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message || "Username onboarding failed.");
      }
      router.replace("/app");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Username onboarding failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>First-Login Onboarding</p>
        <h2 className={styles.title}>Loading onboarding session…</h2>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>First-Login Onboarding</p>
      <h2 className={styles.title}>Choose your username.</h2>
      <p className={styles.description}>
        Signed in as <strong>{session.user.email}</strong>. Complete this step before entering the
        authenticated shell.
      </p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label}>
          Username
          <input
            className={styles.input}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="captain_zenith"
            required
            value={username}
          />
        </label>
        <button className={styles.action} disabled={submitting} type="submit">
          {submitting ? "Saving…" : "Complete onboarding"}
        </button>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
