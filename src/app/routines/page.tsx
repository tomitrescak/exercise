import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { RoutineLibrary } from "./routine-library";

export default function RoutinesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RoutineLibrary />
    </Suspense>
  );
}
