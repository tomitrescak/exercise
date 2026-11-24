"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ImageUp, Play, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/client/api";
import type { PhotoItem } from "@/lib/client/types";
import { blobToDataUrl, formatPhotoDate, localDate, photoUrl, preparePhoto, uploadPhoto, type PreparedPhoto } from "@/lib/client/photos";
import { Button, Card, ErrorBox, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { PhotoViewer } from "./photo-viewer";

type Viewing = { index: number; autoplay: boolean };
type Source = "camera" | "library";
type Pending = { photo: PreparedPhoto; preview: string; source: Source };

// Phones/tablets (coarse pointer) get a direct "Take photo" button; desktops only pick files.
const coarseQuery = "(pointer: coarse)";
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(coarseQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsTouchDevice = () =>
  useSyncExternalStore(subscribeCoarse, () => window.matchMedia(coarseQuery).matches, () => false);

export function PhotosView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["photos"], queryFn: () => api<PhotoItem[]>("/api/photos") });
  const today = localDate();
  const [date, setDate] = useState(today);
  const [caption, setCaption] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const isTouch = useIsTouchDevice();
  const [viewing, setViewing] = useState<Viewing | null>(null);
  // A picked/taken photo waits here for the user to confirm it before anything is uploaded.
  const [pending, setPending] = useState<Pending | null>(null);

  const prepare = useMutation({
    mutationFn: async ({ file, source }: { file: File; source: Source }): Promise<Pending> => {
      const photo = await preparePhoto(file);
      return { photo, preview: await blobToDataUrl(photo.image), source };
    },
    onSuccess: setPending,
  });
  const pick = (source: Source) => {
    upload.reset();
    (source === "camera" ? cameraRef : libraryRef).current?.click();
  };
  const fileInput = (source: Source) => (
    <input
      ref={source === "camera" ? cameraRef : libraryRef}
      type="file"
      accept="image/*"
      capture={source === "camera" ? "environment" : undefined}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) prepare.mutate({ file, source });
      }}
    />
  );

  const upload = useMutation({
    mutationFn: (p: PreparedPhoto) => uploadPhoto(p, date, caption),
    onSuccess: () => {
      setPending(null);
      setCaption("");
      qc.invalidateQueries({ queryKey: ["photos"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/photos/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos"] }),
  });

  // Server returns newest first.
  const photos = useMemo(() => q.data ?? [], [q.data]);
  const chronological = useMemo(() => [...photos].reverse(), [photos]);
  const forDate = photos.find((p) => p.takenOn === date);
  const months = useMemo(() => {
    const groups: { key: string; label: string; items: { photo: PhotoItem; index: number }[] }[] = [];
    photos.forEach((photo, index) => {
      const key = photo.takenOn.slice(0, 7);
      if (groups.at(-1)?.key !== key) groups.push({ key, label: formatPhotoDate(`${key}-01`, { month: "long", year: "numeric" }), items: [] });
      groups.at(-1)!.items.push({ photo, index });
    });
    return groups;
  }, [photos]);

  const closeViewer = useCallback(() => setViewing(null), []);
  // Keep the open viewer in sync with the latest list (e.g. after a delete).
  const viewerPhotos = viewing ? (viewing.autoplay ? chronological : photos) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Photos"
        subtitle="A photo a day to see your progress."
        actions={
          <Button variant="primary" disabled={photos.length === 0} onClick={() => setViewing({ index: 0, autoplay: true })}>
            <Play className="size-4" /> Slideshow
          </Button>
        }
      />

      <Card className="space-y-3">
        <h2 className="font-semibold">Photo of the day</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label="Date">
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
          </Field>
          <Field label="Caption (optional)">
            <Input value={caption} maxLength={500} placeholder="e.g. Week 6, after leg day" onChange={(e) => setCaption(e.target.value)} />
          </Field>
        </div>
        {forDate && (
          <div className="flex items-center gap-3 text-sm text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- served from our own immutable-cached API */}
            <img src={photoUrl(forDate.id, "thumb")} alt="" className="size-14 rounded-md object-cover" />
            <span>There&apos;s already a photo for {date === today ? "today" : formatPhotoDate(date)}. A new one replaces it.</span>
          </div>
        )}
        {fileInput("camera")}
        {fileInput("library")}
        {pending ? (
          <PhotoConfirm
            pending={pending}
            label={date === today ? "today" : formatPhotoDate(date)}
            caption={caption}
            saving={upload.isPending}
            error={upload.isError ? upload.error : null}
            onUse={() => upload.mutate(pending.photo)}
            onRetake={() => pick(pending.source)}
            onCancel={() => {
              upload.reset();
              setPending(null);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:flex">
            {isTouch && (
              <Button variant="primary" loading={prepare.isPending && prepare.variables?.source === "camera"} onClick={() => pick("camera")}>
                <Camera className="size-4" /> Take photo
              </Button>
            )}
            <Button
              variant={isTouch ? "secondary" : "primary"}
              loading={prepare.isPending && prepare.variables?.source === "library"}
              onClick={() => pick("library")}
            >
              <ImageUp className="size-4" /> {isTouch ? "Choose from library" : forDate ? "Replace photo" : "Choose photo"}
            </Button>
          </div>
        )}
        {prepare.isError && <ErrorBox error={prepare.error} />}
      </Card>

      {remove.isError && <ErrorBox error={remove.error} />}
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : photos.length === 0 ? (
        <Card className="text-sm text-muted">No photos yet. Add your first one above.</Card>
      ) : (
        months.map((m) => (
          <section key={m.key} className="space-y-2">
            <h2 className="text-sm font-medium text-muted">{m.label}</h2>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
              {m.items.map(({ photo, index }) => (
                <button
                  key={photo.id}
                  onClick={() => setViewing({ index, autoplay: false })}
                  className="group relative aspect-square overflow-hidden rounded-md bg-surface-2"
                  aria-label={`Open photo from ${formatPhotoDate(photo.takenOn)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from our own immutable-cached API */}
                  <img
                    src={photoUrl(photo.id, "thumb")}
                    alt={photo.caption ?? ""}
                    loading="lazy"
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-left text-[11px] text-white">
                    {formatPhotoDate(photo.takenOn, { day: "numeric", month: "short" })}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {viewing && (
        <PhotoViewer
          photos={viewerPhotos}
          startIndex={viewing.index}
          autoplay={viewing.autoplay}
          onClose={closeViewer}
          onDelete={(p) => remove.mutate(p.id)}
        />
      )}
    </div>
  );
}

/** Full-screen "use this photo?" review, like the phone's own camera confirm step. */
function PhotoConfirm({
  pending,
  label,
  caption,
  saving,
  error,
  onUse,
  onRetake,
  onCancel,
}: {
  pending: Pending;
  label: string;
  caption: string;
  saving: boolean;
  error: unknown;
  onUse: () => void;
  onRetake: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="dialog" aria-modal aria-label="Confirm photo" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">Use this photo for {label}?</div>
          {caption.trim() && <div className="truncate text-sm text-white/70">{caption.trim()}</div>}
        </div>
        <button className="rounded-full p-2.5 text-white/90 hover:bg-white/15" onClick={onCancel} disabled={saving} aria-label="Cancel">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the not-yet-uploaded photo */}
        <img src={pending.preview} alt="Preview of the selected photo" className="max-h-full max-w-full object-contain" />
      </div>
      {!!error && <div className="px-4 pt-2"><ErrorBox error={error} /></div>}
      <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button className="border-white/30! bg-white/10! text-white!" disabled={saving} onClick={onRetake}>
          <RotateCcw className="size-4" /> {pending.source === "camera" ? "Retake" : "Choose another"}
        </Button>
        <Button variant="primary" loading={saving} onClick={onUse}>
          <Check className="size-4" /> Use photo
        </Button>
      </div>
    </div>
  );
}
