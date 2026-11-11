# standby-server

Everything that runs on the Standby Studios server (standbystudios-main-1).

- `apps/throws` – Signature Throws store server (Stripe Checkout + webhooks)
- `sites/signaturethrows` – public website files for signaturethrows.com
- `deploy/` – Docker Compose, Caddy (web server + HTTPS), and the deploy script
- `i.sh` – one-time installer for the auto-update agent

The server checks this repository every 2 minutes and deploys new commits on `main`.
**Never commit secrets.** Stripe keys and customer data live only on the server in `/opt/standby/secrets` and `/opt/standby/data`.
