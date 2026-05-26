"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { readSession, readSettings, updateSettings, type SettingsPayload } from "../auth-client";
import styles from "../auth-shell.module.css";

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving">("idle");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const session = await readSession();
        if (!mounted) {
          return;
        }
        if (!session) {
          router.replace("/login?next=/settings");
          return;
        }
        if (session.user.onboardingRequired) {
          router.replace("/onboarding/username");
          return;
        }

        const resolvedSettings = await readSettings();
        if (!mounted) {
          return;
        }
        setSettings(resolvedSettings);
        setUsername(resolvedSettings.username);
      } catch {
        if (mounted) {
          setError("Unable to load account settings.");
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const saveSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const updated = await updateSettings(username);
      setSettings(updated);
      setUsername(updated.username);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Unable to update settings.");
    } finally {
      setStatus("idle");
    }
  };

  if (!settings) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Account Settings</p>
        <h2 className={styles.title}>Loading account settings…</h2>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Account Settings</p>
      <h2 className={styles.title}>Manage account basics.</h2>
      <p className={styles.description}>
        Email <strong>{settings.email}</strong> · Email verified{" "}
        <strong>{settings.emailVerified ? "Yes" : "No"}</strong> · MFA enabled{" "}
        <strong>{settings.mfaEnabled ? "Yes" : "No"}</strong>
      </p>
      <form className={styles.form} onSubmit={saveSettings}>
        <label className={styles.label}>
          <span>Username</span>
          <input
            className={styles.input}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
        </label>
        <button className={styles.action} disabled={status !== "idle"} type="submit">
          {status === "saving" ? "Saving..." : "Save settings"}
        </button>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
