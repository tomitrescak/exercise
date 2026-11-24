"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { api, errorText } from "@/lib/client/api";
import { Button, Card, Field, Input } from "@/components/ui";

export function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { password } });
      const next = params.get("next");
      // Only allow same-site relative redirects.
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch (err) {
      setError(errorText(err));
      setLoading(false);
    }
  };

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Dumbbell className="size-5 text-accent" /> Exercise Coach
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Password" error={error ?? undefined}>
          <Input type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={loading} disabled={!password}>
          Sign in
        </Button>
      </form>
    </Card>
  );
}
