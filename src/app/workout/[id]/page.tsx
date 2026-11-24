import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { WorkoutPlayer } from "./workout-player";

export default function WorkoutPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <WorkoutPlayer />
    </Suspense>
  );
}
