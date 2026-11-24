import { db } from "@/prisma/db";
import { ProfileSchema, type Profile } from "@/lib/schemas";

export const PROFILE_ID = "me";

export const DEFAULT_PROFILE: Profile = {
  displayName: null,
  ageYears: null,
  sex: null,
  weightKg: null,
  heightCm: null,
  experienceLevel: "intermediate",
  primaryGoal: "general_health",
  focusNotes: null,
  equipment: [],
  sessionMaxMinutes: 30,
  sessionsPerWeek: 3,
  healthConstraints: null,
  benchmarks: null,
};

export type StoredProfile = Profile & { updatedAt: Date | null };

export async function getProfile(): Promise<StoredProfile> {
  const row = await db.orm.public.UserProfile.first({ id: PROFILE_ID });
  if (!row) return { ...DEFAULT_PROFILE, updatedAt: null };
  const parsed = ProfileSchema.safeParse(row);
  const base = parsed.success ? parsed.data : DEFAULT_PROFILE;
  return { ...base, updatedAt: row.updatedAt };
}

export async function saveProfile(p: Profile): Promise<StoredProfile> {
  const data = { ...p, equipment: p.equipment as never, benchmarks: (p.benchmarks ?? null) as never };
  await db.orm.public.UserProfile.upsert({ create: { id: PROFILE_ID, ...data }, update: data });
  return getProfile();
}

export async function patchProfile(patch: Partial<Profile>): Promise<StoredProfile> {
  const { updatedAt: _ignored, ...current } = await getProfile();
  return saveProfile(ProfileSchema.parse({ ...current, ...patch }));
}
