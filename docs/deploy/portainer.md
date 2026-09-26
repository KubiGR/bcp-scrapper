# Hosting on Portainer with a Cloudflare Tunnel

This runs the app on your own server (x86-64) as a Portainer stack of three containers:
Postgres, the app (API + web) and `cloudflared`. People reach it at `https://<your hostname>`
through a Cloudflare Tunnel, so nothing on the server is opened to the internet. Everyone logs
in with their own account; they all use **your** BCP login behind the scenes, so only add people
you trust.

## 1. Put the code in a private GitHub repository

1. Create a **private** repository on GitHub (e.g. `bcp-analyzer`).
2. Check that secrets and recorded data stay out of it:

   ```bash
   git check-ignore .env fixtures/bcp/recorded
   ```

   Both paths must be printed. If one isn't, stop and fix `.gitignore` first.

3. Push:

   ```bash
   git remote add origin git@github.com:<you>/bcp-analyzer.git
   git push -u origin main
   ```

4. Create a **fine-grained personal access token** for Portainer (GitHub → Settings → Developer
   settings → Fine-grained tokens): only this repository, permission **Contents: Read-only**.
   Keep it for step 3.

## 2. Create the Cloudflare Tunnel

You need a domain on Cloudflare.

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** →
   **Cloudflared**. Name it (e.g. `bcp`).
2. On the install page, copy the **token** (the long string after `--token`). Don't run the
   install command: the stack runs `cloudflared` for you.
3. **Public hostname:** subdomain `bcp`, your domain, service **HTTP** → `app:3000`.
   Your address is now e.g. `bcp.example.com`.

Already running a tunnel on this server? Skip creating one: add the public hostname
`bcp.example.com` → `http://app:3000` to your tunnel, connect that tunnel's container to the
stack's `bcp` network, and delete the `tunnel` service from `deploy/portainer-stack.yml`.

## 3. Add the stack in Portainer

1. Portainer → your environment → **Stacks → Add stack** → **Repository**.
2. **Repository URL:** `https://github.com/<you>/bcp-analyzer`, reference `refs/heads/main`.
   Turn on **Authentication**: username = your GitHub username, password = the token from 1.4.
3. **Compose path:** `deploy/portainer-stack.yml`.
4. **Environment variables** (these live only in Portainer):

   | Variable            | Value                                                                |
   | ------------------- | -------------------------------------------------------------------- |
   | `BCP_REFRESH_TOKEN` | Your BCP refresh token (see "Connecting to BCP" in the README)       |
   | `TUNNEL_TOKEN`      | The tunnel token from 2.2                                            |
   | `PUBLIC_HOSTNAME`   | e.g. `bcp.example.com`                                               |
   | `POSTGRES_PASSWORD` | A long random password (`openssl rand -base64 32`)                   |
   | `SESSION_SECRET`    | Another long random value (`openssl rand -base64 48`)                |
   | `ADMIN_USERNAME`    | Your login name                                                      |
   | `ADMIN_PASSWORD`    | A password of 12+ characters, used once to create your admin account |

   Optional: `MIN_EVENT_ROUNDS`, `MIN_EVENT_PLAYERS`, `FETCH_QUEUE_INTERVAL_MS`, `LOG_LEVEL`,
   `ALLOWED_HOSTS` (extra names, e.g. a LAN address if you publish port 3000 for debugging).

5. **Deploy the stack.** The first build takes a few minutes (Portainer builds the image from
   the repository's `Dockerfile`).

## 4. First login

1. Open `https://bcp.example.com` and log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
2. In Portainer, **remove `ADMIN_PASSWORD`** from the stack's variables and update the stack.
   (It is only used while there are no users; removing it keeps it out of the container.)
3. **Settings → Users → Add user** for each friend. Each gets a one-time password (shown once)
   and must choose their own password when they first log in.

## Updating

Push to `main`, then in Portainer open the stack and click **Pull and redeploy** (tick
**Re-pull image and redeploy** so the image is rebuilt). Database migrations run on start.

## Backups

The data lives in the `bcp-pgdata` volume. To back it up:

```bash
docker exec <stack>-db-1 pg_dump -U bcp bcp | gzip > bcp-$(date +%F).sql.gz
```

Restore into a fresh stack with `gunzip -c file.sql.gz | docker exec -i <stack>-db-1 psql -U bcp bcp`.

## Optional: Cloudflare Access in front

For an extra lock before the login page: Zero Trust → **Access → Applications → Add an
application → Self-hosted**, domain `bcp.example.com`, policy **Allow** with the email addresses
of the people you invite (login method: one-time PIN). Visitors then prove their email to
Cloudflare before they can even see the app.

## Troubleshooting

- **403 "Unexpected Host header":** `PUBLIC_HOSTNAME` doesn't match the address in the browser.
- **The app keeps restarting:** check its logs in Portainer; a missing variable is named there.
- **"BCP login rejected" in Settings:** the refresh token expired; update `BCP_REFRESH_TOKEN` and
  redeploy.
