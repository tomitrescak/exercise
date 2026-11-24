import { z } from "zod";
import { handler, HttpError, json } from "@/lib/http";
import { getHistory } from "@/lib/server/sessions";

const Query = z.object({
  weeks: z.coerce.number().int().min(1).max(52).default(12),
  routineId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["date_desc", "date_asc", "duration_desc", "duration_asc"]).default("date_desc"),
});

export const GET = handler(async (request) => {
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) throw new HttpError(400, "Invalid query", z.flattenError(parsed.error));
  return json(await getHistory(parsed.data));
});
