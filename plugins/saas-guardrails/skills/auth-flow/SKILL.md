---
name: auth-flow
description: Use when building or changing login, signup, logout, sessions, password reset, invitations or the logged-in navigation of a web app (Next.js, Better Auth, Auth.js, Clerk, Supabase Auth, Lucia). Covers redirects after login, back-button and cache bugs, open redirects, brute-force limits and email handling.
---

# Auth flows that feel right and stay safe

## Navigation

- The **logo inside the app** goes to the app's home (dashboard), never to the marketing page and
  never logs out.
- The **landing page** shows "Go to dashboard" to a logged-in visitor instead of "Log in / Sign up".
- **Login and signup pages** redirect a logged-in visitor to the dashboard (on the server).
- **Remember the last workspace/organization** (a cookie) and open it after login.

## Return to the requested page

Send a logged-out visitor to `/login?next=/the/page`, also when the session expires mid-use. Keep
`next` on the "Sign up instead" and "Log in instead" links, so an invitation link survives a detour
through signup.

Only follow `next` when it's a same-site path:

```ts
export function safeNextPath(next: unknown, fallback = "/dashboard") {
  if (typeof next !== "string") return fallback;
  const cleaned = next.replace(/[\u0000-\u001f\u007f\s]/g, "");  // "/\t/evil.com" tricks
  if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) return fallback;
  return cleaned;
}
```

## Back button and stale pages

After login and logout use a full page load, not the client router:

```ts
window.location.replace(safeNextPath(next));
```

And reload pages the browser restores from its back/forward cache, so "Back" after logout doesn't
show a private page:

```ts
useEffect(() => {
  const onShow = (e: PageTransitionEvent) => e.persisted && window.location.reload();
  window.addEventListener("pageshow", onShow);
  return () => window.removeEventListener("pageshow", onShow);
}, []);
```

Verify this on a **production build**: dev servers cache differently.

## Brute force and email abuse

- Limit password logins **per IP and per account** (for example 20 per 15 minutes each). Many auth
  libraries default to something like 3 per 10 seconds per IP, which still allows ~26,000 guesses
  a day. Skip the per-account limit for shared demo logins, or visitors lock each other out.
- Limit every endpoint that sends email (signup, reset, invite, verify) per IP **and per user**:
  a per-organization limit alone is bypassed by creating more organizations.
- Store limits in the database or Redis when you run serverless: instances don't share memory.
- Behind a proxy, read the client IP from a header only the proxy can set, and don't expose the
  app port publicly, or the IP (and the limit) can be faked.

## Accounts

- Compare and store emails in lowercase; trim them.
- Validate display names on the server (length, no line breaks or control characters): they end
  up in email subjects and headers.
- Password reset revokes other sessions. Reset and verification links expire.
- Demo mode: if emails are off, say so on "Forgot password" instead of promising an email.

## Checklist

- [ ] Logo → dashboard; landing page and auth pages aware of the session.
- [ ] `?next=` kept through login/signup/expiry, validated with a same-site check.
- [ ] `location.replace` after login/logout; `pageshow` reload; tested on a production build.
- [ ] Per-IP and per-account login limits; per-user limits on emails.
- [ ] Emails lowercased; names validated on the server.
