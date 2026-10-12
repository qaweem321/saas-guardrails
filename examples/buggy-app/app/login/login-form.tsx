"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/dashboard";

  async function onSubmit(formData: FormData) {
    const result = await signIn.email({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });
    if (!result.error) {
      router.push(next);
    }
  }

  return (
    <form action={onSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button type="submit">Log in</button>
    </form>
  );
}
