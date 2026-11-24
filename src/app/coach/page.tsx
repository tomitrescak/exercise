import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { CoachStart } from "./coach-start";

export default function CoachPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CoachStart />
    </Suspense>
  );
}
