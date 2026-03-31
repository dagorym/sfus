import { PageState } from "../components/page-state";

export default function NotFound() {
  return (
    <PageState
      eyebrow="Signal Lost"
      title="404 · Sector not found"
      description="The page you tried to reach is outside the mapped public frontier. Return to the landing page to continue exploring the foundation shell."
      primaryHref="/"
      primaryLabel="Return home"
    />
  );
}
