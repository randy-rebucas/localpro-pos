# Cloudflare Turnstile

Turnstile protects the three public web forms from bots. It sits on top of the rate limits, not in place of them.

| Form | API route | Action | If Cloudflare can't be reached |
| --- | --- | --- | --- |
| `/signup` | `/api/tenants/signup` | `signup` | Blocked |
| `/[tenant]/[lang]/login` | `/api/auth/login` | `login` | Allowed, rate limit still applies |
| `/super-admin/login` | `/api/super-admin/auth/login` | `super_admin_login` | Allowed, rate limit still applies |

Logins stay up during a Cloudflare outage so stores can keep trading. A rejected token is always refused, outage or not.

## Setup

1. In the Cloudflare dashboard, go to Turnstile and add a widget in Managed mode.
2. Add every hostname that serves these forms. Subdomains of a listed hostname are covered, so `1pos.solutions` covers tenant subdomains and `admin.1pos.solutions`. **Each tenant custom domain must be listed separately.** The widget fails on any other hostname, and staff on that domain can't log in.
3. Set both variables and rebuild. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is compiled into the client bundle, so changing it needs a new build.

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

Turnstile is enforced only when both are set. With either one missing, forms work as before and production logs a warning on each submit.

## Testing

Cloudflare's test keys work on any hostname, including localhost:

| Purpose | Site key | Secret key |
| --- | --- | --- |
| Always passes | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Always blocks | `2x00000000000000000000AB` | |
| Token rejected by the server | | `2x0000000000000000000000000000000AA` |
| Token already spent | | `3x0000000000000000000000000000000AA` |

## Clients that aren't browsers

Turnstile needs a browser, so any other client calling a protected route gets 403 with `code: "TURNSTILE_FAILED"` once it's enabled. Native apps should use `/api/auth/mobile-login`, which isn't protected. `load-tests/auth.js` calls `/api/auth/login`, so run it against an environment without Turnstile.

## Not covered

These public routes have no web form in this repo, so they have no widget: `/api/auth/mobile-login`, `/api/auth/register`, `/api/auth/reset-password`, `/api/auth/customer/send-otp` and `/api/auth/customer/verify-otp`. They rely on rate limits.
