export interface SessionUser {
  username: string;
  email: string;
  displayName: string | null;
  onboardingRequired: boolean;
}

export interface SessionPayload {
  user: SessionUser;
}

export const readSession = async (): Promise<SessionPayload | null> => {
  const response = await fetch("/api/auth/session", {
    credentials: "include"
  });

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to resolve current session.");
  }
  return (await response.json()) as SessionPayload;
};

export interface ProfilePayload {
  username: string;
  email: string;
  displayName: string | null;
}

export interface SettingsPayload {
  username: string;
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

export async function readProfile(): Promise<ProfilePayload> {
  const response = await fetch("/api/auth/profile", {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error("Failed to load profile.");
  }
  return (await response.json()) as ProfilePayload;
}

export async function updateProfile(displayName: string): Promise<ProfilePayload> {
  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      displayName
    })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to update profile.");
  }
  return (await response.json()) as ProfilePayload;
}

export async function readSettings(): Promise<SettingsPayload> {
  const response = await fetch("/api/auth/settings", {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error("Failed to load settings.");
  }
  return (await response.json()) as SettingsPayload;
}

export async function updateSettings(username: string): Promise<SettingsPayload> {
  const response = await fetch("/api/auth/settings", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      username
    })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Failed to update settings.");
  }
  return (await response.json()) as SettingsPayload;
}
