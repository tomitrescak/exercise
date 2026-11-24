import { handler, json, parseBody } from "@/lib/http";
import { SetLogInputSchema } from "@/lib/schemas";
import { logSet } from "@/lib/server/sessions";

export const POST = handler<{ id: string }>(async (request, { id }) =>
  json(await logSet(id, await parseBody(request, SetLogInputSchema)), { status: 201 }),
);
