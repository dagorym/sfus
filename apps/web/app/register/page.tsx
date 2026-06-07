"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  describeRegistrationError,
  toApiRequestError
} from "../auth-client";
import styles from "../auth-shell.module.css";

const providerOptions = [
  { key: "google", label: "Create account with Google" },
  { key: "github", label: "Create account with GitHub" }
];

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    setSuccess(null);
    try {
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email,
          username,
          password
        })
      });
      if (!registerResponse.ok) {
        throw await toApiRequestError(registerResponse, "Registration failed.");
      }
      const registrationPayload = (await registerResponse.json().catch(() => null)) as
        | {
            emailVerification?: {
              token?: string;
            };
          }
        | null;
      if (!registrationPayload) {
        throw new Error("Registration failed because the API returned an invalid response.");
      }

      const verificationToken = registrationPayload.emailVerification?.token;
      if (!verificationToken) {
        setSuccess("Registration succeeded. Verify your email before signing in.");
        setStatus("idle");
        return;
      }

      const verifyResponse = await fetch("/api/auth/verify-email", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          token: verificationToken
        })
      });
      if (!verifyResponse.ok) {
        throw await toApiRequestError(
          verifyResponse,
          "Registration succeeded, but automatic email verification failed."
        );
      }

      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });
      const loginPayload = (await loginResponse.json().catch(() => null)) as
        | {
            mfa?: { challengeToken: string; nextPath: string };
            user?: { onboardingRequired: boolean };
          }
        | null;
      if (!loginResponse.ok || !loginPayload) {
        if (!loginResponse.ok) {
          throw await toApiRequestError(
            loginResponse,
            "Registration succeeded, but automatic sign-in failed."
          );
        }
        throw new Error("Registration succeeded, but automatic sign-in returned an invalid response.");
      }
      if (loginPayload.mfa?.challengeToken) {
        const params = new URLSearchParams({
          challenge: loginPayload.mfa.challengeToken,
          next: loginPayload.mfa.nextPath || "/app"
        });
        router.replace(`/login?${params.toString()}`);
        return;
      }
      if (loginPayload.user?.onboardingRequired) {
        router.replace("/onboarding/username");
        return;
      }
      router.replace("/app");
    } catch (registrationError) {
      setError(describeRegistrationError(registrationError));
      setStatus("idle");
    }
  };

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>First Visit</p>
      <h2 className={styles.title}>Create your account.</h2>
      <p className={styles.description}>
        Start with Google or GitHub for the fastest setup. If you prefer local credentials, use the
        email/password fallback below.
      </p>
      <div className={styles.actions}>
        {providerOptions.map((provider) => (
          <a className={styles.secondaryAction} href={`/api/auth/external/${provider.key}/start`} key={provider.key}>
            {provider.label}
          </a>
        ))}
      </div>
      <p className={styles.eyebrow}>Prefer local email and password?</p>
      <p className={styles.description}>Use local registration as a fallback option.</p>
      <ul className={styles.description}>
        <li>Username must be 3-32 characters: letters, numbers, periods, dashes, or underscores.</li>
        <li>Password must be at least 12 characters.</li>
      </ul>
      <form className={styles.form} onSubmit={handleSubmit}>
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
          <span>Username</span>
          <input
            className={styles.input}
            maxLength={32}
            minLength={3}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            pattern="[A-Za-z0-9_.-]{3,32}"
            required
            title="3-32 characters using letters, numbers, periods, dashes, or underscores."
            value={username}
          />
        </label>
        <label className={styles.label}>
          <span>Password</span>
          <input
            autoComplete="new-password"
            className={styles.input}
            minLength={12}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <button className={styles.action} disabled={status !== "idle"} type="submit">
          {status === "submitting" ? "Registering..." : "Register"}
        </button>
      </form>
      <div className={styles.actions}>
        <Link className={styles.secondaryAction} href="/login">
          Back to sign in
        </Link>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {success ? <p className={styles.status}>{success}</p> : null}
    </section>
  );
}
