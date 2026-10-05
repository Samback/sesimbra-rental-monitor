# Sesimbra rental push Worker

This Worker provides the backend for opt-in web push from the rental catalog. The Codex monitor remains responsible for verifying listings; the Worker does not crawl property sites.

## Cloudflare deployment

Cloudflare Workers Builds is connected to this repository with:

- Production branch: `main`
- Root directory: `/worker`
- Deploy command: `npx wrangler deploy`
- KV binding: `PUSH_STATE`, configured in `wrangler.jsonc`

Push a commit that changes a file under `worker/` to build and deploy the Worker.

## Runtime configuration

The Wrangler config sets the public catalog origin and VAPID subject. The `PUSH_STATE` KV namespace ID is also configured there.

Add these values as Worker runtime settings in Cloudflare. Never commit the secrets or put them in chat:

1. `VAPID_PUBLIC_KEY` (text variable) and `VAPID_PRIVATE_KEY` (secret) from the same VAPID key pair.
2. `NOTIFY_TOKEN` (secret), also needed by whichever trusted monitor sender calls `POST /notify`.

The push sender still needs to be connected to the monitoring workflow. The site must also be configured with the Worker URL and matching public VAPID key before visitors can subscribe.

## Routes

- `GET /health`: reports whether required bindings and secrets exist.
- `GET /vapid-public-key`: returns the public application-server key to the catalog.
- `POST /subscribe`: stores a validated browser push subscription.
- `POST /unsubscribe`: removes a subscription.
- `POST /notify`: sends one verified, long-term, eligible listing event; duplicate event IDs are ignored.

The Worker accepts subscription writes only from the catalog origin, and accepts notification events only with the bearer token.
