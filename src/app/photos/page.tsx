import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { PhotosView } from "./photos-view";

export default function PhotosPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PhotosView />
    </Suspense>
  );
}
