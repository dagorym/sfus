"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AuthorizationError,
  readProfile,
  resolveProtectedSession,
  updateProfile,
  setAvatar,
  removeAvatar,
  type ProfilePayload
} from "../auth-client";
import { ImageUpload, type ImageUploadResult } from "../../components/image-upload";
import { UserAvatar } from "../../components/user-avatar";
import styles from "../auth-shell.module.css";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [avatarStatus, setAvatarStatus] = useState<"idle" | "removing">("idle");
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const session = await resolveProtectedSession("/profile");
        if (!mounted) {
          return;
        }
        if (!session.session) {
          if (session.redirectTo) {
            router.replace(session.redirectTo);
          }
          return;
        }

        const resolvedProfile = await readProfile();
        if (!mounted) {
          return;
        }
        setProfile(resolvedProfile);
        setDisplayName(resolvedProfile.displayName || "");
      } catch (loadError) {
        if (mounted) {
          if (loadError instanceof AuthorizationError) {
            setError(loadError.message);
          } else {
            setError("Unable to load profile.");
          }
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

  /**
   * Called by ImageUpload after a successful avatar upload.
   * The returned mediaId is sent to PUT /api/users/me/avatar to bind the avatar.
   * The avatarUrl returned by the server is stored in profile state so the
   * UserAvatar component updates without a full reload.
   */
  const handleAvatarUpload = async (result: ImageUploadResult) => {
    setAvatarError(null);
    try {
      const avatarUrl = await setAvatar(result.id);
      setProfile((prev) => prev ? { ...prev, avatarUrl } : prev);
    } catch (avatarUploadError) {
      setAvatarError(
        avatarUploadError instanceof Error
          ? avatarUploadError.message
          : "Failed to set avatar."
      );
    }
  };

  /**
   * Remove the current avatar via DELETE /api/users/me/avatar.
   */
  const handleRemoveAvatar = async () => {
    setAvatarStatus("removing");
    setAvatarError(null);
    try {
      await removeAvatar();
      setProfile((prev) => prev ? { ...prev, avatarUrl: null } : prev);
    } catch (removeError) {
      setAvatarError(
        removeError instanceof Error ? removeError.message : "Failed to remove avatar."
      );
    } finally {
      setAvatarStatus("idle");
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

      {/* Avatar section */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
        <UserAvatar
          avatarSrc={profile.avatarUrl ?? null}
          displayName={profile.displayName}
          username={profile.username}
          size={56}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <ImageUpload
            resourceType="avatar"
            onUpload={(result) => { void handleAvatarUpload(result); }}
            onError={(msg) => setAvatarError(msg)}
            label="Upload avatar"
          />
          {profile.avatarUrl ? (
            <button
              type="button"
              className={styles.action}
              style={{ minWidth: "auto", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
              disabled={avatarStatus !== "idle"}
              onClick={() => { void handleRemoveAvatar(); }}
            >
              {avatarStatus === "removing" ? "Removing…" : "Remove avatar"}
            </button>
          ) : null}
        </div>
      </div>
      {avatarError ? <p className={styles.error}>{avatarError}</p> : null}

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
