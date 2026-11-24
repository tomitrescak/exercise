"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";

export function useStartRoutine() {
  const router = useRouter();
  return useMutation({
    mutationFn: (routineId: string) => api<{ id: string }>("/api/sessions", { body: { routineId } }),
    onSuccess: (s) => router.push(`/workout/${s.id}`),
  });
}

export function useRefineRoutine() {
  const router = useRouter();
  return useMutation({
    mutationFn: (routineId: string | null) => api<{ id: string }>("/api/conversations", { body: { routineId } }),
    onSuccess: (c) => router.push(`/coach/${c.id}`),
  });
}
