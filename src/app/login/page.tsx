import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
