import { z } from "zod";
import { handler, HttpError, json } from "@/lib/http";
import { listPhotos, MAX_PHOTO_BYTES, PHOTO_MIME_TYPES, savePhoto } from "@/lib/server/photos";

export const GET = handler(async () => json(await listPhotos()));

const Fields = z.object({
  takenOn: z.iso.date(),
  caption: z.string().trim().max(500).optional(),
  width: z.coerce.number().int().positive().max(20000),
  height: z.coerce.number().int().positive().max(20000),
});

async function readImage(form: FormData, name: string): Promise<{ type: string; bytes: Uint8Array }> {
  const file = form.get(name);
  if (!(file instanceof File)) throw new HttpError(400, `Missing ${name} file`);
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) throw new HttpError(415, `Unsupported image type ${file.type}`);
  if (file.size > MAX_PHOTO_BYTES) throw new HttpError(413, "Image is too large (max 8 MB)");
  return { type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** multipart/form-data: image, thumb, takenOn, width, height, caption? */
export const POST = handler(async (request) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, "Expected multipart form data");
  }
  const parsed = Fields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) throw new HttpError(400, "Validation failed", z.flattenError(parsed.error));
  const [image, thumb] = await Promise.all([readImage(form, "image"), readImage(form, "thumb")]);
  const { caption, ...rest } = parsed.data;
  return json(await savePhoto({ ...rest, caption: caption || null, mimeType: image.type, data: image.bytes, thumb: thumb.bytes }), { status: 201 });
});
