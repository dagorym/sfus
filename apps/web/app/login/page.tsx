"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import styles from "../auth-shell.module.css";

const providers = [
  { key: "google", label: "Continue with Google" },
  { key: "github", label: "Continue with GitHub" }
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const challengeToken = searchParams.get("challenge")?.trim() ?? "";
  const nextPath = useMemo(() => {
    const candidate = searchParams.get("next")?.trim() ?? "/app";
    return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/app";
  }, [searchParams]);
  const encodedNextPath = useMemo(() => encodeURIComponent(nextPath), [nextPath]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [usingRecoveryCode, setUsingRecoveryCode] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  const submitPasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            mfa?: { challengeToken: string; nextPath: string };
            user?: { onboardingRequired: boolean };
          }
        | null;
      if (!response.ok || !payload) {
        throw new Error("Sign-in failed.");
      }
      if (payload.mfa?.challengeToken) {
        const params = new URLSearchParams({
          challenge: payload.mfa.challengeToken,
          next: payload.mfa.nextPath || nextPath
        });
        router.replace(`/login?${params.toString()}`);
        return;
      }
      if (payload.user?.onboardingRequired) {
        router.replace("/onboarding/username");
        return;
      }
      router.replace(nextPath);
    } catch {
      setError("Sign-in failed. Verify your credentials and try again.");
    } finally {
      setStatus("idle");
    }
  };

  const submitMfaChallenge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challengeToken || !code.trim()) {
      setError("Enter your authenticator or recovery code.");
      return;
    }

    setStatus("submitting");
    setError(null);
    try {
      const response = await fetch("/api/auth/mfa/challenge", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(
          usingRecoveryCode
            ? { challengeToken, recoveryCode: code.trim() }
            : { challengeToken, totpCode: code.trim() }
        )
      });
      if (!response.ok) {
        throw new Error("MFA verification failed.");
      }

      const payload = (await response.json()) as { redirectPath?: string };
      router.replace(payload.redirectPath || nextPath);
    } catch {
      setError("MFA verification failed. Check your code and try again.");
    } finally {
      setStatus("idle");
    }
  };

  if (challengeToken) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Multi-factor Authentication</p>
        <h2 className={styles.title}>Verify your sign-in</h2>
        <p className={styles.description}>
          Enter a code from your authenticator app or one of your recovery codes.
        </p>
        <form className={styles.form} onSubmit={submitMfaChallenge}>
          <label className={styles.label}>
            <span>Verification mode</span>
            <select
              className={styles.input}
              value={usingRecoveryCode ? "recovery" : "totp"}
              onChange={(event) => setUsingRecoveryCode(event.target.value === "recovery")}
            >
              <option value="totp">Authenticator code</option>
              <option value="recovery">Recovery code</option>
            </select>
          </label>
          <label className={styles.label}>
            <span>{usingRecoveryCode ? "Recovery code" : "Authenticator code"}</span>
            <input
              className={styles.input}
              name="mfa-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button className={styles.action} type="submit" disabled={status !== "idle"}>
              {status === "submitting" ? "Verifying..." : "Verify and continue"}
            </button>
            <Link className={styles.secondaryAction} href="/">
              Return to public shell
            </Link>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>External Authentication</p>
      <h2 className={styles.title}>Sign in to your command deck.</h2>
      <p className={styles.description}>
        Use your local account or an external provider. New external accounts complete username
        onboarding before entering the authenticated shell.
      </p>
      <form className={styles.form} onSubmit={submitPasswordLogin}>
        <label className={styles.label}>
           <span>Email</span>
           <input
             autoComplete="email"
             className={styles.input}
             name="email"
             onChange={(event) => setEmail(event.target.value)}
             required
             type="email"
             value={email}
           />
        </label>
        <label className={styles.label}>
           <span>Password</span>
           <input
             autoComplete="current-password"
             className={styles.input}
             name="password"
             onChange={(event) => setPassword(event.target.value)}
             required
             type="password"
             value={password}
           />
        </label>
        <button className={styles.action} disabled={status !== "idle"} type="submit">
           {status === "submitting" ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <div className={styles.actions}>
        {providers.map((provider) => (
           <a
             className={styles.secondaryAction}
             href={`/api/auth/external/${provider.key}/start?next=${encodedNextPath}`}
             key={provider.key}
           >
             {provider.label}
           </a>
        ))}
      </div>
      <div className={styles.actions}>
        <Link className={styles.secondaryAction} href="/register">
           Create a local account
        </Link>
        <Link className={styles.secondaryAction} href="/">
           Return to public shell
        </Link>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
