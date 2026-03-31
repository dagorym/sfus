"use client";

import { useEffect } from "react";
import { PageState } from "../components/page-state";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageState
      eyebrow="System Interruption"
      title="A hyperspace fault disrupted this page."
      description="The public landing shell encountered an unexpected error. You can retry the current route or return to the homepage."
      primaryAction={reset}
      primaryLabel="Retry page"
      secondaryHref="/"
      secondaryLabel="Go to homepage"
    />
  );
}
