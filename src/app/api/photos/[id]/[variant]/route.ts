import { handler, notFound } from "@/lib/http";
import { getPhotoBytes } from "@/lib/server/photos";

// Photo rows are immutable (replacing a day's photo creates a new id), so the bytes behind a URL
// never change and browsers may cache them forever. "private" keeps shared caches out: these sit behind login.
const CACHE = "private, max-age=31536000, immutable";

/** GET /api/photos/:id/full or /api/photos/:id/thumb — the raw image bytes. */
export const GET = handler<{ id: string; variant: string }>(async (request, { id, variant }) => {
  if (variant !== "full" && variant !== "thumb") notFound();
  const etag = `"${id}-${variant}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE } });
  }
  const photo = await getPhotoBytes(id, variant);
  if (!photo) notFound("Photo not found");
  return new Response(photo.bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.bytes.byteLength),
      "Cache-Control": CACHE,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
