# Buggy sample app

A tiny, made-up SaaS (Next.js App Router + Drizzle style) with **7 planted bugs**, the kind real
products ship. It's here so you can watch the audit work:

```
cd examples/buggy-app
claude --plugin-dir ../../plugins/saas-guardrails
> /saas-guardrails:audit
```

The answer key is in `EXPECTED-FINDINGS.md`. Don't open it first if you want to judge the audit
fairly. This code is not meant to run: it's just enough to read.
