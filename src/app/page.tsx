import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { Dashboard } from "./dashboard";

export default function HomePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Dashboard />
    </Suspense>
  );
}
