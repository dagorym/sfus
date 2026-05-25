export interface SessionUser {
  username: string;
  email: string;
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
