"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import styles from "../auth-shell.module.css";

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
      const registrationPayload = (await registerResponse.json().catch(() => null)) as
        | {
            emailVerification?: {
              token?: string;
            };
          }
        | null;
      if (!registerResponse.ok || !registrationPayload) {
        throw new Error("Registration failed.");
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
        throw new Error("Email verification failed.");
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
        throw new Error("Automatic sign-in after registration failed.");
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
      setError(
        registrationError instanceof Error ? registrationError.message : "Registration failed."
      );
      setStatus("idle");
    }
  };

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Local Registration</p>
      <h2 className={styles.title}>Create your account.</h2>
      <p className={styles.description}>
        Register with email, username, and password. Development mode verifies email automatically
        from the returned token.
      </p>
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
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            required
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
