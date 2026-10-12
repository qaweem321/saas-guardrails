"use server";

import { requireOwner } from "@/lib/session";

const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[::1\]|\[::ffff:127\.)/;

// "Send test" button on the Webhooks page: shows the endpoint's answer.
export async function sendTest(formData: FormData) {
  await requireOwner(String(formData.get("slug")));
  const url = new URL(String(formData.get("url")));
  if (url.protocol !== "https:" || PRIVATE.test(url.hostname)) {
    return { error: "Please use a public https address." };
  }
  const response = await fetch(url, { method: "POST", body: JSON.stringify({ test: true }) });
  return { status: response.status, body: (await response.text()).slice(0, 500) };
}
