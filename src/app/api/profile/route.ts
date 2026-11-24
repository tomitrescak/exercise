import { handler, json, parseBody } from "@/lib/http";
import { ProfilePatchSchema, ProfileSchema } from "@/lib/schemas";
import { getProfile, patchProfile, saveProfile } from "@/lib/server/profile";

export const GET = handler(async () => json(await getProfile()));

export const PUT = handler(async (request) => json(await saveProfile(await parseBody(request, ProfileSchema))));

export const PATCH = handler(async (request) =>
  json(await patchProfile(await parseBody(request, ProfilePatchSchema))),
);
