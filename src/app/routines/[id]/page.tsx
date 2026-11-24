import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { RoutineDetailView } from "./routine-detail";

export default function RoutinePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RoutineDetailView />
    </Suspense>
  );
}
