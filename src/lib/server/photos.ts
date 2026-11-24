import { db } from "@/prisma/db";

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export async function listPhotos() {
  return db.orm.public.Photo.select("id", "takenOn", "caption", "width", "height", "createdAt")
    .orderBy((p) => p.takenOn.desc())
    .all();
}

/** Stores the photo for a date, replacing any existing one (the new row gets a fresh id/URL). */
export async function savePhoto(input: {
  takenOn: string;
  caption: string | null;
  mimeType: string;
  width: number;
  height: number;
  data: Uint8Array;
  thumb: Uint8Array;
}) {
  return db.transaction(async (tx) => {
    await tx.orm.public.Photo.where({ takenOn: input.takenOn }).delete();
    const p = await tx.orm.public.Photo.create(input);
    return { id: p.id, takenOn: p.takenOn, caption: p.caption, width: p.width, height: p.height, createdAt: p.createdAt };
  });
}

export async function getPhotoBytes(id: string, variant: "full" | "thumb") {
  const row =
    variant === "full"
      ? await db.orm.public.Photo.where({ id }).select("mimeType", "data").first()
      : await db.orm.public.Photo.where({ id }).select("mimeType", "thumb").first();
  if (!row) return null;
  return { mimeType: row.mimeType, bytes: "data" in row ? row.data : row.thumb };
}

export async function deletePhoto(id: string): Promise<boolean> {
  return (await db.orm.public.Photo.where({ id }).delete()) != null;
}
