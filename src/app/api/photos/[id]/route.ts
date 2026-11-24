import { handler, notFound } from "@/lib/http";
import { deletePhoto } from "@/lib/server/photos";

export const DELETE = handler<{ id: string }>(async (_req, { id }) => {
  if (!(await deletePhoto(id))) notFound("Photo not found");
  return new Response(null, { status: 204 });
});
