import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { ProfileEditor } from "./profile-editor";

export default function ProfilePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProfileEditor />
    </Suspense>
  );
}
