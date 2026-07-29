# Work Threads

Developer-first work threads: chat + tasks as the system of work, with optional GitLab issue export.

## Prerequisites

- Docker / Docker Compose

## Run with Docker (recommended)

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000), register an account, and create a thread.

The `app` service bind-mounts the repo so source changes hot-reload. After changing `package.json` / lockfile, rebuild:

```bash
docker compose up --build
```

Postgres is also exposed on host port **5433** if you want to connect from tools on the host.

## Local GitLab (optional)

GitLab CE is behind Compose profile `gitlab` because the image is large and wants roughly **4GB RAM**. First boot can take several minutes.

```bash
docker compose --profile gitlab up --build
```

UI: [http://localhost:8929](http://localhost:8929) · SSH: `localhost:2224`

1. Wait until healthy (or until the sign-in page loads).
2. Get the initial root password (valid ~24h after first start):

```bash
docker compose --profile gitlab exec gitlab grep '^Password:' /etc/gitlab/initial_root_password
```

3. Sign in as `root` **or** register a normal user (signup approval is off for this local Compose setup). Create a blank project (e.g. `work-threads`) and note its project id.

If an existing account is stuck on “pending approval”:

```bash
docker compose --profile gitlab exec gitlab gitlab-rails runner "u=User.find_by_username('YOUR_USERNAME'); u.update!(state: 'active'); puts u.state"
```

4. Bootstrap the OAuth application (prints client id/secret):

```powershell
Get-Content scripts/bootstrap-gitlab-oauth.rb | docker compose --profile gitlab exec -T gitlab gitlab-rails runner -
```

5. Put these in `.env` next to `docker-compose.yml`:

```env
GITLAB_PUBLIC_URL=http://localhost:8929
GITLAB_OAUTH_CLIENT_ID=...
GITLAB_OAUTH_CLIENT_SECRET=...
GITLAB_PROJECT_ID=1
```

(`GITLAB_URL` defaults to `http://host.docker.internal:8929` for API calls from the app container.)

6. Recreate the app so it picks up OAuth env:

```bash
docker compose --profile gitlab up -d --force-recreate app
```

7. In Work Threads, expand the sidebar → **Connect GitLab** → authorize.
8. Open a thread → **GitLab project** to create a private project in your personal namespace (linked participants with GitLab connected are added as Developers). Then use **GitLab issue** to export into that project.

`GITLAB_PROJECT_ID` is optional — only needed if you want a shared fallback project instead of per-thread projects.

## Local Node (optional)

If you prefer running Next.js on the host:

```bash
docker compose up -d postgres
npm install
npx prisma migrate dev
npm run dev
```

Use the host `.env` `DATABASE_URL` pointing at `localhost:5433`.

## Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres URL (Compose overrides this for `app`) |
| `AUTH_SECRET` | Auth.js secret (random long string) |
| `AUTH_URL` | App origin, e.g. `http://localhost:3000` |
| `GITLAB_URL` | GitLab API origin from the app (Compose: `http://host.docker.internal:8929`) |
| `GITLAB_PUBLIC_URL` | Browser GitLab origin for OAuth (`http://localhost:8929`) |
| `GITLAB_OAUTH_CLIENT_ID` | OAuth application id (from bootstrap script) |
| `GITLAB_OAUTH_CLIENT_SECRET` | OAuth application secret |
| `GITLAB_PROJECT_ID` | Optional shared fallback project if a thread has no linked project |

Compose sets sensible defaults; you can put overrides in a `.env` next to `docker-compose.yml`.

## GitLab issue export

Each Work Threads user connects **their own** GitLab account via OAuth (`api read_user`). **GitLab project** creates a private project in that user’s personal namespace and adds other linked participants as Developers. **GitLab issue** then exports into the thread’s project (or `GITLAB_PROJECT_ID` if set). Nothing is auto-created.

## Demo accounts

```bash
npm run db:seed
# or inside Compose:
docker compose exec app npm run db:seed
```

Password for all: `password123`

| Email | @mention |
|-------|----------|
| user1@example.com | @user1 |
| user2@example.com | @user2 |
| user3@example.com | @user3 |
| alice@example.com | @alice |
| bob@example.com | @bob |

Also seeds a sample thread: **Demo: Build break on Network B** (user1–3 + alice).

## Chat tasks

In a thread, send for example:

- `/task @user1 check cert/proxy settings`
- `@user2 /task patch bootstrap script`
- `/task patch bootstrap script @alice`

Order of `/task` and `@mention` does not matter. Assignees must already be participants.

## Realtime

Thread pages subscribe to Server-Sent Events (`/api/threads/:id/events`) backed by Postgres `LISTEN/NOTIFY`. Messages, tasks, invites, and settings updates push live without a manual refresh.

## Attachments

Paste, drop, or use **+** to attach images, GIFs, video, audio, and common files (up to 50MB). Media renders inline in chat; other files download. URLs in message text are auto-linked.

