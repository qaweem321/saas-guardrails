---
name: safe-outbound-requests
description: Use when the server fetches or posts to a URL a user typed - webhooks, "test connection" buttons, link previews, image-from-URL imports, custom domains, OAuth/OIDC discovery. Prevents SSRF into the server's own network and the cloud metadata service, including IPv6 and DNS-rebinding bypasses.
---

# Safe outbound requests (SSRF)

If a user can make your server call an address, they can aim it at `http://169.254.169.254/`
(cloud credentials), `localhost` admin ports or your private network. A "Send test" button that
shows the response status is enough to map that network.

## The three bypasses naive checks miss

1. **Rewritten hosts.** `new URL("https://[::ffff:127.0.0.1]/").hostname` is `[::ffff:7f00:1]`,
   and the metadata address `[::ffff:169.254.169.254]` becomes `[::ffff:a9fe:a9fe]`. A regex for
   `::ffff:1.2.3.4` never matches. Also `[::127.0.0.1]` and `[64:ff9b::7f00:1]` (NAT64). Check the
   hostname **after** `new URL()`: checking the raw string also misses `127.1`, `2130706433` and
   `0x7f.1`, which `new URL()` normalizes to `127.0.0.1`.
2. **DNS.** `hooks.evil.com` resolves to `10.0.0.5`. Checking the name string does nothing.
3. **DNS rebinding.** The name resolves to a public IP when you check and to a private IP when the
   request connects. Checking first and fetching second is not enough.

## The fix (Node.js)

Use `net.BlockList`. It also matches IPv4 addresses wrapped in IPv6.

```ts
import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["224.0.0.0", 3]] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 96], ["64:ff9b::", 96], ["2002::", 16], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8]] as const) blocked.addSubnet(net, bits, "ipv6");

export function isPrivateAddress(address: string) {
  const ip = address.replace(/^\[|\]$/g, "");
  const v = isIP(ip);
  return v !== 0 && blocked.check(ip, v === 4 ? "ipv4" : "ipv6");
}
```

Then check the address **at connect time**, inside the request's own DNS lookup, so the check and
the connection use the same answer:

```ts
import { lookup } from "node:dns";
import { request } from "node:https";

const safeLookup = (host, options, cb) =>
  lookup(host, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err);
    if (addresses.some((a) => isPrivateAddress(a.address))) return cb(new Error("Private address"));
    options.all ? cb(null, addresses) : cb(null, addresses[0].address, addresses[0].family);
  });

request(url, { method: "POST", lookup: safeLookup, timeout: 5000 }, onResponse);
```

A literal IP in the URL skips DNS, so also reject `isIP(host) && isPrivateAddress(host)` before
sending.

## Also

- `https:` only in production; reject `user:password@` in URLs.
- **Don't follow redirects** (a public URL can redirect to a private one), or re-check every hop.
- Short timeouts; read and discard the body; don't show the response body to the user.
- `fetch()` (undici) ignores a custom `lookup`: use `node:https` with `lookup`, or an undici
  `Agent` with a `connect.lookup`, for anything a user typed.
- Rate-limit "send test" buttons per user and workspace.

## Tests that matter

Pass every case through `new URL()` first, exactly as production does:

```ts
for (const raw of ["https://[::ffff:127.0.0.1]/", "https://[::ffff:169.254.169.254]/",
  "https://127.1/", "https://2130706433/", "https://0x7f.1/", "https://[::127.0.0.1]/"]) {
  assert.equal(isPrivateAddress(new URL(raw).hostname), true, raw);
}
```

## Checklist

- [ ] Hostname checked after `new URL()`, with `BlockList` (or an equivalent CIDR library).
- [ ] Resolved addresses checked inside the connection's lookup.
- [ ] No redirects followed; timeouts set; response bodies not echoed.
- [ ] Tests include IPv6-mapped, decimal and short-form IPv4.
