"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { resolveProtectedSession, hasGlobalRole } from "../auth-client";
import styles from "../auth-shell.module.css";

const adminSections = [
  {
    href: "/admin/blog",
    label: "Blog",
    description: "Manage blog posts: create, edit, publish, unpublish, and delete entries."
  },
  {
    href: "/admin/pages",
    label: "Pages",
    description: "Manage standalone pages: create, edit, publish, and delete site pages."
  },
  {
    href: "/admin/navigation",
    label: "Navigation",
    description: "Configure site navigation items, order, visibility, and link types."
  },
  {
    href: "/admin/forums",
    label: "Forums",
    description: "Manage forum categories and boards: create, edit, reorder, and delete."
  }
] as const;

export default function AdminDashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const resolved = await resolveProtectedSession("/admin");
        if (!mounted) return;
        if (!resolved.session) {
          if (resolved.redirectTo) router.replace(resolved.redirectTo);
          return;
        }
        if (!hasGlobalRole(resolved.session.user, "admin")) {
          setError("Admin access required.");
          return;
        }
        setReady(true);
      } catch {
        if (mounted) setError("Unable to load admin dashboard.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (error) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin</p>
        <h2 className={styles.title}>Access denied.</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Admin</p>
        <h2 className={styles.title}>Loading…</h2>
        <p className={styles.status}>Retrieving admin console.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <p className={styles.eyebrow}>Admin</p>
      <h2 className={styles.title}>Admin Dashboard</h2>
      <p className={styles.description}>
        Select a section below to manage site content and configuration.
      </p>
      <div className={styles.actions}>
        {adminSections.map((section) => (
          <Link key={section.href} href={section.href} className={styles.secondaryAction}>
            <span>
              <strong>{section.label}</strong>
              <br />
              <span style={{ fontWeight: 400, fontSize: "0.85em" }}>{section.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
