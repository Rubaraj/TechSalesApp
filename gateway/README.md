# api.rubarajan.dev — multi-project API gateway

One stable public hostname for every home-lab project, served from the Pi:

```
Internet ── Cloudflare (rubarajan.dev DNS + TLS)
              │  named tunnel (token-managed, systemd: cloudflared)
              ▼
Pi: cloudflared ──► Caddy :8080
                      ├─ /               → this directory's index.html (/srv/api-gateway)
                      ├─ /techsales/*    → 127.0.0.1:4000  (TechSales API, prefix stripped)
                      └─ /<project>/*    → future projects
```

Cloudflare-side config is a single public hostname (`api.rubarajan.dev` →
`http://localhost:8080`) that never changes — all routing lives in the
Caddyfile here, under version control.

## Adding a new project

1. Run the project's API on the Pi on its own port (e.g. `:4100`), ideally as
   a systemd service (copy `/etc/systemd/system/techsales-api.service`).
2. Add a block to `Caddyfile` (prefix is stripped before proxying):
   ```
   handle_path /myproject/* {
       reverse_proxy 127.0.0.1:4100
   }
   ```
3. Add an entry to `index.html`.
4. Deploy both to the Pi:
   ```
   sudo cp Caddyfile /etc/caddy/Caddyfile
   sudo cp index.html /srv/api-gateway/index.html
   sudo systemctl reload caddy
   ```
   (The TechSales deploy script `scripts/deploy-api-to-pi.ps1` syncs these
   automatically on every deploy.)

The project is then live at `https://api.rubarajan.dev/myproject/...`.
WebSockets and SSE work through both cloudflared and Caddy without extra
config. If the project needs to know its public URL (as TechSales does for
Twilio webhooks), configure it WITH the prefix, e.g.
`PUBLIC_BASE_URL=https://api.rubarajan.dev/myproject`.

## TechSales specifics

- API base: `https://api.rubarajan.dev/techsales/api/...`
- Twilio webhooks: `.../techsales/api/twilio/{voice,status,incoming}`
- Media stream: `wss://api.rubarajan.dev/techsales/ws/twilio-media`
- The Pi's `/opt/techsales-api/.env` is the CANONICAL production env. The
  deploy script never overwrites it — new env keys must be added there by
  hand (then `sudo systemctl restart techsales-api`).
- Docs/OpenAPI: not served yet; a hand-written `openapi.yaml` + static
  swagger-ui under `/srv/api-gateway/techsales-docs/` is the planned
  follow-up if needed.

## Operations quick reference (on the Pi)

```
journalctl -u techsales-api -f     # API logs
journalctl -u cloudflared -f       # tunnel logs
journalctl -u caddy -f             # gateway logs
sudo systemctl restart techsales-api
sudo systemctl reload caddy
```
