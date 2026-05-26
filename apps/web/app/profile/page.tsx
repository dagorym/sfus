"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { readProfile, readSession, updateProfile, type ProfilePayload } from "../auth-client";
import styles from "../auth-shell.module.css";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState("");
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
          router.replace("/login?next=/profile");
          return;
        }
        if (session.user.onboardingRequired) {
          router.replace("/onboarding/username");
          return;
        }

        const resolvedProfile = await readProfile();
        if (!mounted) {
          return;
        }
        setProfile(resolvedProfile);
        setDisplayName(resolvedProfile.displayName || "");
      } catch {
        if (mounted) {
          setError("Unable to load profile.");
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const updated = await updateProfile(displayName);
      setProfile(updated);
      setDisplayName(updated.displayName || "");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Unable to update profile.");
    } finally {
      setStatus("idle");
    }
  };

  if (!profile) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Profile Basics</p>
        <h2 className={styles.title}>Loading profile…</h2>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Profile Basics</p>
      <h2 className={styles.title}>Update your profile.</h2>
      <p className={styles.description}>
        Username <strong>{profile.username}</strong> · Email <strong>{profile.email}</strong>
      </p>
      <form className={styles.form} onSubmit={saveProfile}>
        <label className={styles.label}>
          <span>Display name</span>
          <input
            className={styles.input}
            maxLength={80}
            name="displayName"
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </label>
        <button className={styles.action} disabled={status !== "idle"} type="submit">
          {status === "saving" ? "Saving..." : "Save profile"}
        </button>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
