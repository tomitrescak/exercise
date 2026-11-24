import { ApiError } from "@/lib/client/api";
import type { PhotoItem } from "@/lib/client/types";

export const photoUrl = (id: string, variant: "full" | "thumb") => `/api/photos/${id}/${variant}`;

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatPhotoDate(takenOn: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Date(`${takenOn}T00:00:00`).toLocaleDateString([], opts);
}

async function toJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // transparent PNGs would otherwise turn black in JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("Could not encode the image");
  return { blob, width, height };
}

/** Downscales on-device (phone photos are often 5–12 MB) into a full image and a gallery thumbnail. */
export async function preparePhoto(file: File) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // honours EXIF orientation
  } catch {
    throw new Error("That file couldn't be read as an image.");
  }
  try {
    const full = await toJpeg(bitmap, 2048, 0.85);
    const thumb = await toJpeg(bitmap, 480, 0.8);
    return { image: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}

export type PreparedPhoto = Awaited<ReturnType<typeof preparePhoto>>;

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function uploadPhoto(p: PreparedPhoto, takenOn: string, caption: string): Promise<PhotoItem> {
  const form = new FormData();
  form.set("image", p.image, "photo.jpg");
  form.set("thumb", p.thumb, "thumb.jpg");
  form.set("takenOn", takenOn);
  form.set("width", String(p.width));
  form.set("height", String(p.height));
  if (caption.trim()) form.set("caption", caption.trim());
  const res = await fetch("/api/photos", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.details);
  return data as PhotoItem;
}
