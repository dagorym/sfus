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
  const [code, setCode] = useState("");
  const [usingRecoveryCode, setUsingRecoveryCode] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

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
