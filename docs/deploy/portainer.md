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

## 2. Point a Cloudflare Tunnel at the app

You need a domain on Cloudflare. The app listens on the server's loopback at port **3080**
(`APP_PORT` changes it); it is not reachable from the LAN.

**cloudflared already runs on the server** (the usual case): Cloudflare dashboard → **Zero Trust
→ Networks → Tunnels** → your tunnel → **Public hostname → Add**: subdomain `bcp`, your domain,
service **HTTP**, URL **`localhost:3080`**. Leave "HTTP Host Header" empty.

**No tunnel yet:** create one there (**Create a tunnel → Cloudflared**), copy the **token** (the
long string after `--token`) without running the install command, add the public hostname with
service **HTTP** → **`app:3000`**, and in step 3 also set `TUNNEL_TOKEN` and
`COMPOSE_PROFILES=tunnel` so the stack starts its own `cloudflared`.

Your address is now e.g. `bcp.example.com`.

## 3. Add the stack in Portainer

1. Portainer → your environment → **Stacks → Add stack** → **Repository**.
2. **Repository URL:** `https://github.com/<you>/bcp-analyzer`, reference `refs/heads/main`.
   Turn on **Authentication**: username = your GitHub username, password = the token from 1.4.
3. **Compose path:** `deploy/portainer-stack.yml`.
4. **Environment variables** (these live only in Portainer):

   | Variable            | Value                                                                |
   | ------------------- | -------------------------------------------------------------------- |
   | `BCP_REFRESH_TOKEN` | Your BCP refresh token (see "Connecting to BCP" in the README)       |
   | `PUBLIC_HOSTNAME`   | e.g. `bcp.example.com`                                               |
   | `POSTGRES_PASSWORD` | A long random password (`openssl rand -base64 32`)                   |
   | `SESSION_SECRET`    | Another long random value (`openssl rand -base64 48`)                |
   | `ADMIN_USERNAME`    | Your login name                                                      |
   | `ADMIN_PASSWORD`    | A password of 12+ characters, used once to create your admin account |

   Optional: `APP_PORT` (default 3080), `MIN_EVENT_ROUNDS`, `MIN_EVENT_PLAYERS`,
   `WH40K_ELO_ENABLED` (default true: wh40k-elo's ratings imported daily),
   `FETCH_QUEUE_INTERVAL_MS`, `LOG_LEVEL`; `TUNNEL_TOKEN` and `COMPOSE_PROFILES=tunnel` only for
   the stack's own tunnel (step 2).

   Open the app through `https://<PUBLIC_HOSTNAME>` only: logging in needs HTTPS, and the login
   rate limit trusts the visitor address Cloudflare adds.

5. **Deploy the stack.** The first build takes a few minutes (Portainer builds the image from
   the repository's `Dockerfile`).

## 4. First login

1. Open `https://bcp.example.com` and log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
2. In Portainer, **remove `ADMIN_PASSWORD`** from the stack's variables and update the stack.
   (It is only used while there are no users; removing it keeps it out of the container.)
3. **Settings → Users → Add user** for each friend. Each gets a one-time password (shown once)
   and must choose their own password when they first log in.

## Updating

Turn on automatic updates once: open the stack → **GitOps updates** (Portainer CE) → **Polling**,
interval e.g. `5m`, reference `refs/heads/main`. After that every push to `main` is picked up
within the interval: Portainer redeploys the stack, and the app image is rebuilt from the new code
(`pull_policy: build` in the stack file). Database migrations run on start.

To update by hand instead: open the stack → **Pull and redeploy**.

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

### Sign in with Access only (no second login)

With Access in front you can drop the app's own login: the app then trusts Cloudflare's signed
token for who the visitor is. Add these to the stack's variables and redeploy:

| Variable             | Value                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `ACCESS_TEAM_DOMAIN` | Your team domain, e.g. `myteam.cloudflareaccess.com` (Zero Trust → Settings → Custom pages)        |
| `ACCESS_AUD`         | The application's **Application Audience (AUD) Tag** (Access → Applications → your app → Overview) |
| `ADMIN_EMAILS`       | Comma-separated emails of the admins; everyone else Access lets in is a member                     |

- Anyone Access's policy admits gets an account on first visit, **waiting for approval**: until
  an admin approves them (Settings → Users → Waiting for approval), every page shows them only a
  "Waiting for approval" page, with no app and no data. Admins (`ADMIN_EMAILS`) never wait. So the
  policy can simply allow any Google login (Include → Login Methods → Google) instead of listing
  everyone's email: the app's approval is the gate.
- Removing someone in the Users card takes their access away; if they sign in again they wait for
  approval again. There are no passwords in this mode (no new accounts or resets in the app).
- How long you stay signed in is Cloudflare's **Session Duration** (the application's settings,
  and Settings → Authentication → global session timeout); the app has no session of its own.
- A request without a valid token for this application is refused, so a wrong value locks everyone
  out rather than letting anyone in: fix the variable and redeploy.
- `SESSION_SECRET`, `ADMIN_USERNAME` and `ADMIN_PASSWORD` are not needed.

### Email to the admins

The app can email the admins when someone new signs in and waits for approval, and once a day with
what's left to do (people waiting, detachment names to link, detachments outside their faction),
only when there's anything. It's off until a sending account is set. With Gmail:

1. Turn on 2-Step Verification for the Google account that will send (Google Account → Security).
2. Create an **app password** (Google Account → Security → App passwords), named e.g. "Logis".
3. Add these to the stack's variables and redeploy:

| Variable        | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| `SMTP_USER`     | The Gmail address that sends, e.g. `you@gmail.com`                               |
| `SMTP_PASSWORD` | The 16-letter app password (not your Google password)                            |
| `NOTIFY_EMAILS` | Optional: comma-separated recipients; `ADMIN_EMAILS` when empty                  |
| `DIGEST_HOUR`   | Optional: the hour (UTC, 0–23) the daily email goes; 6 by default (09:00 Athens) |

Links in the emails point at `https://PUBLIC_HOSTNAME`. Another SMTP server works too: set
`SMTP_HOST` and `SMTP_PORT` as well (465 for TLS, 587 for STARTTLS). The app's log says
"Email to admins is off" when it isn't set up, and "Sent an email" for each one sent.

## Troubleshooting

- **403 "Unexpected Host header":** `PUBLIC_HOSTNAME` doesn't match the address in the browser.
- **The app keeps restarting:** check its logs in Portainer; a missing variable is named there.
- **"BCP login rejected" in Settings:** the refresh token expired; update `BCP_REFRESH_TOKEN` and
  redeploy.
