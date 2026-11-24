import { z } from "zod";
import { handler, json, notFound, parseBody } from "@/lib/http";
import { CursorSchema } from "@/lib/schemas";
import { deleteSession, getSession, updateCursor } from "@/lib/server/sessions";

type P = { id: string };

export const GET = handler<P>(async (_req, { id }) => {
  const s = await getSession(id);
  if (!s) notFound("Session not found");
  return json({ ...s, serverNow: new Date().toISOString() });
});

export const PATCH = handler<P>(async (request, { id }) => {
  const { cursor } = await parseBody(request, z.object({ cursor: CursorSchema }));
  return json(await updateCursor(id, cursor));
});

export const DELETE = handler<P>(async (_req, { id }) => {
  if (!(await deleteSession(id))) notFound("Session not found");
  return new Response(null, { status: 204 });
});
