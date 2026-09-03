# Self-hosted GitHub Actions runner (automated deploy)

One-time setup on the production VPS, as the user that owns `/opt/household`
(`vitaliy` on this box). Afterwards every push to `main` deploys itself via
[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) — see
`README.md` → Deployment → Automated deploy for what the job actually does.

A self-hosted runner was chosen over an SSH action because the runner dials
**out** to GitHub: no private key has to live in GitHub Secrets, and the VPS
keeps port 22 closed to everything but the operator.

## 0. Prerequisite: make the prod overlay the default

The deploy job (and the `post-merge` hook it shares its rebuild script with)
runs bare `docker compose` commands from `/opt/household`. Without this step
they resolve to `docker-compose.yml` **only**, silently restarting production
services without `docker-compose.prod.yml` — no `NODE_ENV=production`, no CORS
allow-lists, no `AUTH_COOKIE_SECURE`.

Compose reads `COMPOSE_FILE` from the project's `.env`, so setting it once
fixes every invocation, including manual ones:

```bash
echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml' >> /opt/household/.env
cd /opt/household && docker compose config | grep -c 'NODE_ENV: production'   # expect 7
```

This is production-only and deliberately not in `.env.example`: local dev must
keep resolving to `docker-compose.yml` alone.

## 1. Install the runner

Get a registration token from
`https://github.com/VitaliiPoltorak/household/settings/actions/runners/new`
(it expires after an hour) and substitute it below. Check the page for the
current runner version rather than copying a stale one from here.

```bash
sudo mkdir -p /opt/actions-runner && sudo chown vitaliy:vitaliy /opt/actions-runner
cd /opt/actions-runner

RUNNER_VERSION=2.337.0
curl -o actions-runner.tar.gz -L \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
tar xzf actions-runner.tar.gz && rm actions-runner.tar.gz

./config.sh \
  --url https://github.com/VitaliiPoltorak/household \
  --token REPLACE_WITH_REGISTRATION_TOKEN \
  --name household-vps \
  --work _work \
  --unattended --replace
```

Do **not** install the runner as root: the job's `docker compose` calls must
run as the user that owns `/opt/household` and is in the `docker` group,
otherwise the deploy rebuilds the stack under a different Docker context and
leaves root-owned files in the checkout.

## 2. Run it as a systemd service

`svc.sh` generates and enables a unit (`actions.runner.*.service`) with
`Restart=always`, so the runner comes back after a crash and after a reboot:

```bash
sudo ./svc.sh install vitaliy
sudo ./svc.sh start
sudo ./svc.sh status          # expect: active (running), "Listening for Jobs"
```

Verify the reboot survival rather than assuming it — that is an acceptance
criterion of [#305](https://github.com/VitaliiPoltorak/household/issues/305):

```bash
sudo reboot
# after it comes back:
sudo systemctl is-enabled 'actions.runner.*.service'   # expect: enabled
```

## 3. Verify the deploy path

```bash
# On the repo: push a docs-only change to main.
#   -> Deploy job goes green, `docker compose ps` shows no restarted service.
# Then a change under apps/<one-service>/src.
#   -> Deploy job rebuilds and restarts exactly that one service.
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
```

`Status` is the check that matters: only the deployed service should show a
freshly reset uptime.

## Memory footprint

The box is 4 GB and the stack already idles close to it, so the runner's cost
is not a rounding error. The listener is a ~100 MB .NET process while idle;
during a job it forks a worker plus the `docker compose build` itself, which is
the expensive part and was already happening on this box before the runner
existed.

Check it after it has been running a while:

```bash
free -h
systemctl status 'actions.runner.*.service' | grep Memory
```

If it turns out to cost too much, the fallback is the SSH-trigger variant
(a workflow on `ubuntu-latest` that SSHes in) — cheaper on the VPS, but it
puts a deploy key in GitHub Secrets.

## Maintenance

```bash
sudo ./svc.sh stop && sudo ./svc.sh start    # restart the runner
journalctl -u 'actions.runner.*.service' -n 50   # what the runner itself did
```

Job output (the `git pull`, the rebuild) is in the Actions tab, not in
`journalctl` — the unit only logs the listener's own lifecycle.

To remove the runner entirely: `sudo ./svc.sh uninstall` then
`./config.sh remove --token <a fresh removal token>`.
