import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { CoachView } from "./coach-view";

export default function ConversationPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CoachView />
    </Suspense>
  );
}
