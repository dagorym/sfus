"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { readSession, type SessionPayload } from "../app/auth-client";
import styles from "../app/layout.module.css";

const publicNavigation = [
  { href: "/", label: "Home" },
  { href: "/login", label: "Sign in" },
  { href: "/register", label: "Register" }
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resolvedSession = await readSession();
        if (mounted) {
          setSession(resolvedSession);
        }
      } catch {
        if (mounted) {
          setSession(null);
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [pathname]);

  const navigation = session
    ? session.user.onboardingRequired
      ? [
          { href: "/", label: "Home" },
          { href: "/onboarding/username", label: "Complete onboarding" }
        ]
      : [
          { href: "/", label: "Home" },
          { href: "/app", label: "App" },
          { href: "/profile", label: "Profile" },
          { href: "/settings", label: "Settings" }
        ]
    : publicNavigation;

  const onSignOut = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    }).catch(() => null);
    setSession(null);
    router.replace("/");
    router.refresh();
  };

  return (
    <nav aria-label="Primary" className={styles.nav}>
      {navigation.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
            href={item.href}
          >
            {item.label}
          </Link>
        );
      })}
      {session ? (
        <button className={styles.navButton} onClick={onSignOut} type="button">
          Sign out
        </button>
      ) : null}
    </nav>
  );
}
