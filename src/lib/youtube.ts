import { db } from "@/prisma/db";

const API = "https://www.googleapis.com/youtube/v3";
export const MIN_VIDEO_SEC = 30;
export const MAX_VIDEO_SEC = 600;
export const VERIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class YouTubeError extends Error {}

export type VideoInfo = {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
  embeddable: boolean;
  isPublic: boolean;
  viewCount: number | null;
};

export type VerifyResult =
  | { ok: true; video: VideoInfo; verifiedAt: Date }
  | { ok: false; videoId: string; reason: string };

/** Parses ISO-8601 durations like PT1H2M3S. */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((v) => Number(v ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new YouTubeError("YOUTUBE_API_KEY is not configured on the server");
  return key;
}

type YtItem = {
  id?: string | { videoId?: string };
  snippet?: { title?: string; channelTitle?: string };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
  statistics?: { viewCount?: string };
};

async function ytFetch(path: string, params: Record<string, string>): Promise<{ items?: YtItem[] }> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey());
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason ?? res.statusText;
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new YouTubeError("YouTube API daily quota is exhausted; try again tomorrow");
    }
    throw new YouTubeError(`YouTube API error: ${reason}`);
  }
  return res.json();
}

async function fetchVideos(ids: string[]): Promise<VideoInfo[]> {
  if (ids.length === 0) return [];
  const data = await ytFetch("videos", {
    part: "snippet,contentDetails,status,statistics",
    id: ids.join(","),
    maxResults: String(ids.length),
  });
  return (data.items ?? []).map(
    (item): VideoInfo => ({
      videoId: String(item.id),
      title: item.snippet?.title ?? "",
      channel: item.snippet?.channelTitle ?? "",
      durationSec: parseIsoDuration(item.contentDetails?.duration ?? ""),
      embeddable: item.status?.embeddable === true,
      isPublic: item.status?.privacyStatus === "public",
      viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
    }),
  );
}

export function videoProblem(v: Pick<VideoInfo, "durationSec" | "embeddable" | "isPublic">): string | null {
  if (!v.isPublic) return "video is not public";
  if (!v.embeddable) return "video does not allow embedding";
  if (v.durationSec < MIN_VIDEO_SEC || v.durationSec > MAX_VIDEO_SEC) {
    return `video is ${v.durationSec}s long; must be ${MIN_VIDEO_SEC}s–${MAX_VIDEO_SEC / 60} min`;
  }
  return null;
}

export async function searchVideos(query: string, maxResults: number): Promise<VideoInfo[]> {
  const data = await ytFetch("search", {
    part: "snippet",
    q: query,
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "strict",
    relevanceLanguage: "en",
    maxResults: String(Math.min(Math.max(maxResults, 1), 8)),
  });
  const ids: string[] = (data.items ?? []).flatMap((i) => (typeof i.id === "object" && i.id.videoId ? [i.id.videoId] : []));
  const videos = await fetchVideos(ids);
  // Keep YouTube's relevance order.
  return ids.flatMap((id) => videos.filter((v) => v.videoId === id));
}

/**
 * Verifies a video exists, is public, embeddable and of acceptable length.
 * Uses the VideoCache table when the cached verification is fresh.
 */
export async function verifyVideo(videoId: string, opts: { force?: boolean } = {}): Promise<VerifyResult> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return { ok: false, videoId, reason: "not a valid YouTube video ID" };
  }
  if (!opts.force) {
    const cached = await db.orm.public.VideoCache.first({ videoId });
    if (cached && Date.now() - new Date(cached.verifiedAt).getTime() < VERIFICATION_TTL_MS) {
      const problem = videoProblem(cached);
      if (problem) return { ok: false, videoId, reason: problem };
      return {
        ok: true,
        video: { ...cached, viewCount: null },
        verifiedAt: new Date(cached.verifiedAt),
      };
    }
  }
  const [video] = await fetchVideos([videoId]);
  if (!video) return { ok: false, videoId, reason: "video does not exist or was removed" };
  const verifiedAt = new Date();
  const row = {
    title: video.title,
    channel: video.channel,
    durationSec: video.durationSec,
    embeddable: video.embeddable,
    isPublic: video.isPublic,
    verifiedAt,
  };
  await db.orm.public.VideoCache.upsert({ create: { videoId, ...row }, update: row });
  const problem = videoProblem(video);
  if (problem) return { ok: false, videoId, reason: problem };
  return { ok: true, video, verifiedAt };
}
