# #415 socket-direct — user story
Links: [planning](planning.md) · [sequence](diagram/uml_diagram/socket-route.md)

- **Actors:** VN player on Viettel (lossy leg to Cloudflare free IPs); foreign player; operator (user).
- **Story:** as a VN player I want my moves/clock/chat to arrive in tens of ms, not 0.4–5 s, without
  changing how I open or log into the site.
- **Rules:** only countries in `DIRECT_SOCKET_COUNTRIES` (VN) go direct; everyone else unchanged; any
  direct failure falls back to Cloudflare silently, never logs the player out, never opens a second socket.
- **Hard constraints:** session cookie stays host-only; CF-* headers on the direct path are never trusted;
  flag off = today's behaviour; VPS IP becomes public (operator must accept).
