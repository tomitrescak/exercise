import { z } from "zod";
import { handler, parseBody } from "@/lib/http";
import { runCoachTurn, type AgentEvent } from "@/lib/agent/run";

export const POST = handler<{ id: string }>(async (request, { id }) => {
  const { content } = await parseBody(request, z.object({ content: z.string().trim().min(1).max(8000) }));
  const encoder = new TextEncoder();
  const send = (e: AgentEvent) => encoder.encode(`data: ${JSON.stringify(e)}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runCoachTurn(id, content, request.signal)) controller.enqueue(send(event));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Coach failed";
        controller.enqueue(send({ type: "error", message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
