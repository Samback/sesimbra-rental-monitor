# Sesimbra rental push Worker

This Worker sends web push to subscriptions created by the catalog’s opt-in button.

## Cloudflare resources

1. Create a Workers KV namespace and bind it as `PUSH_STATE`.
2. Set the text variable `ALLOWED_ORIGIN` to `https://samback.github.io`.
3. Set the text variable `VAPID_SUBJECT` to `https://samback.github.io/sesimbra-rental-monitor/`.
4. Set the text variable `VAPID_PUBLIC_KEY` and secret `VAPID_PRIVATE_KEY` to one matching VAPID key pair.
5. Set the secret `NOTIFY_TOKEN` to a random token. The monitor workflow will use the same token as a GitHub Actions secret.
6. Replace the KV namespace ID in `wrangler.jsonc` before deploying.

Keep the private VAPID key and notification token out of Git, logs, and chat. The Worker accepts subscription writes only from the catalog origin, and accepts notification events only with the bearer token.

## Routes

- `GET /health`: reports whether required bindings and secrets exist.
- `GET /vapid-public-key`: returns the public application-server key to the catalog.
- `POST /subscribe`: stores a validated browser push subscription.
- `POST /unsubscribe`: removes a subscription.
- `POST /notify`: sends one verified, long-term, eligible listing event; duplicate event IDs are ignored.

The Worker does not crawl listings. The existing Codex monitor remains responsible for verification and catalog updates.
