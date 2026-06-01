"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { readSession, type SessionPayload } from "../app/auth-client";
import styles from "../app/layout.module.css";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";

interface DynamicNavItem {
  id: string;
  label: string;
  url: string;
  visibility: string;
  isActive: boolean;
  children: DynamicNavItem[];
}

/**
 * Fetches active navigation items from the NavigationService API.
 * Returns public items for guests; all active items for authenticated users.
 * Falls back to an empty array on error so the shell still renders.
 */
async function fetchNavItems(authenticated: boolean): Promise<DynamicNavItem[]> {
  try {
    const endpoint = authenticated
      ? `${apiBase}/navigation/items/authenticated`
      : `${apiBase}/navigation/items/public`;
    const response = await fetch(endpoint, { cache: "no-store", credentials: authenticated ? "include" : "omit" });
    if (!response.ok) return [];
    const data = (await response.json()) as { items: DynamicNavItem[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

// Auth-aware nav links appended after dynamic items
const authNavLinks = {
  guest: [
    { href: "/login", label: "Sign in" },
    { href: "/register", label: "Register" }
  ],
  onboarding: [{ href: "/onboarding/username", label: "Complete onboarding" }],
  authenticated: [
    { href: "/app", label: "App" },
    { href: "/profile", label: "Profile" },
    { href: "/settings", label: "Settings" }
  ]
};

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [dynamicItems, setDynamicItems] = useState<DynamicNavItem[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      let resolvedSession: SessionPayload | null = null;
      try {
        resolvedSession = await readSession();
      } catch {
        resolvedSession = null;
      }
      if (!mounted) return;
      setSession(resolvedSession);

      const items = await fetchNavItems(resolvedSession !== null);
      if (mounted) setDynamicItems(items);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [pathname]);

  const onSignOut = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include"
    }).catch(() => null);
    setSession(null);
    setDynamicItems([]);
    router.replace("/");
    router.refresh();
  };

  // Determine auth-specific fixed links
  const fixedLinks = session
    ? session.user.onboardingRequired
      ? authNavLinks.onboarding
      : authNavLinks.authenticated
    : authNavLinks.guest;

  // Filter dynamic items by visibility for the current session state
  const visibleItems = dynamicItems.filter((item) => {
    if (!item.isActive) return false;
    if (item.visibility === "authenticated" && !session) return false;
    return true;
  });

  return (
    <nav aria-label="Primary" className={styles.nav}>
      {/* Home link is always first */}
      <Link
        key="/"
        className={`${styles.navLink} ${pathname === "/" ? styles.navLinkActive : ""}`.trim()}
        href="/"
      >
        Home
      </Link>

      {/* Dynamic navigation items from NavigationService */}
      {visibleItems.map((item) => {
        const isActive = pathname === item.url || pathname.startsWith(item.url + "/");
        return (
          <Link
            key={item.id}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
            href={item.url}
          >
            {item.label}
          </Link>
        );
      })}

      {/* Auth-specific fixed links */}
      {fixedLinks.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
            href={link.href}
          >
            {link.label}
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
