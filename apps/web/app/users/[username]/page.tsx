"use client";

/**
 * Public profile page — /users/[username]
 *
 * Renders the minimal public profile for an active user.
 *
 * Security:
 * - Renders ONLY the five allowlisted fields returned by the ST14 API:
 *   username, displayName, avatar, bio, joinDate.
 *   The profileProjection() helper (see ./profile-projection) enforces this at
 *   runtime — unknown keys are dropped even if the API response contains them.
 * - Avatar src comes exclusively from the gated /api/media/<id> path (ST15/ST12).
 *   The UserAvatar component degrades to the initials fallback on load failure.
 * - No user-supplied HTML is rendered (all text via React text nodes).
 * - Username is always encoded via encodeURIComponent in links (ST16 convention).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { UserAvatar } from "../../../components/user-avatar";
import styles from "../../forums/forums.module.css";
import { profileProjection, type PublicProfileShape } from "./profile-projection";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

async function fetchPublicProfile(username: string): Promise<PublicProfileShape | null> {
  const response = await fetch(
    `${apiBase}/users/${encodeURIComponent(username)}`,
    { cache: "no-store" }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error("Failed to load profile.");
  }
  const data = (await response.json()) as { profile: unknown };
  return profileProjection(data.profile);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function UserProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username ?? "";

  const [profile, setProfile] = useState<PublicProfileShape | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let mounted = true;

    const load = async () => {
      try {
        const data = await fetchPublicProfile(username);
        if (mounted) setProfile(data);
      } catch {
        if (mounted) setLoadError("Unable to load this profile.");
      }
    };

    void load();
    return () => { mounted = false; };
  }, [username]);

  if (loadError) {
    return (
      <div className={styles.container}>
        <Link href="/forums" className={styles.backLink}>← Forums</Link>
        <p className={styles.error} role="alert">{loadError}</p>
      </div>
    );
  }

  if (profile === undefined) {
    return (
      <div className={styles.container}>
        <p className={styles.description}>Loading profile…</p>
      </div>
    );
  }

  if (profile === null) {
    return (
      <div className={styles.container}>
        <h1 className={styles.heading}>Profile not found</h1>
        <p className={styles.description}>
          This user does not exist or is not publicly accessible.
        </p>
      </div>
    );
  }

  const joinYear = new Date(profile.joinDate).getFullYear();
  const joinFormatted = new Date(profile.joinDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long"
  });

  return (
    <div className={styles.container}>
      {/* Profile header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginBottom: "1.5rem" }}>
        <UserAvatar
          avatarSrc={profile.avatar}
          displayName={profile.displayName}
          username={profile.username}
          size={64}
        />
        <div>
          <h1 className={styles.heading} style={{ marginBottom: "0.25rem" }}>
            {profile.displayName ?? profile.username}
          </h1>
          <p className={styles.description} style={{ margin: 0 }}>
            @{profile.username}
          </p>
        </div>
      </div>

      {/* Bio — rendered as plain text only */}
      {profile.bio ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <p className={styles.description} style={{ whiteSpace: "pre-wrap", color: "inherit" }}>
            {profile.bio}
          </p>
        </div>
      ) : null}

      {/* Join date */}
      <p className={styles.description}>
        Member since{" "}
        <time dateTime={profile.joinDate} aria-label={`Joined ${joinFormatted}`}>
          {isNaN(joinYear) ? "" : joinFormatted}
        </time>
      </p>
    </div>
  );
}
