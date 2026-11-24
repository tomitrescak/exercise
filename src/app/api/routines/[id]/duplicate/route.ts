import { handler, json } from "@/lib/http";
import { duplicateRoutine } from "@/lib/server/routines";

export const POST = handler<{ id: string }>(async (_req, { id }) => json(await duplicateRoutine(id), { status: 201 }));
