# household systemd units

Two timers live here: `household-backup` (nightly database backup) and
`household-docker-prune` (weekly Docker cleanup, see the last section).

## household-backup

Install (as root, on the production VPS):

```bash
sudo cp infra/systemd/household-backup.service infra/systemd/household-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now household-backup.timer
```

Requires `/opt/household/.env.backup` to exist first (`chmod 600`, owned by
the same user that owns `/opt/household` — `vitaliy` on this VPS, matching
`User=` in `household-backup.service` — it holds R2 credentials) — see
`.env.example`'s "Database backups" section for the variables it needs, and
`infra/rclone/README.md` for the rclone side of the setup.

Useful commands:

```bash
systemctl status household-backup.timer      # confirm it's scheduled
systemctl list-timers household-backup.timer # next/last run time
sudo systemctl start household-backup.service # run it now, out of schedule
journalctl -u household-backup.service -n 50  # last run's output
```

A failed run shows up in `systemctl --failed` and `journalctl`, but the
primary alert path is the healthchecks.io ping in `scripts/backup-database.sh`
— see `.env.example` / `README.md` → Deployment → Database backups.

## household-docker-prune

Weekly Docker cleanup ([#409](https://github.com/VitaliiPoltorak/household/issues/409)) — runs
`scripts/prune-docker.sh`, which caps the BuildKit build cache (default 10GB) and removes dangling
images older than 7 days. It never touches containers, volumes or tagged images, so
`household/<svc>:previous` (the rollback target) survives. The same script also runs at the end of
every deploy (`.github/workflows/deploy.yml`); this timer is the safety net for weeks without a
deploy or a deploy whose prune step failed.

Install (as root, on the production VPS):

```bash
sudo cp infra/systemd/household-docker-prune.service infra/systemd/household-docker-prune.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now household-docker-prune.timer
```

Useful commands:

```bash
systemctl list-timers household-docker-prune.timer     # next/last run time
sudo systemctl start household-docker-prune.service    # run it now, out of schedule
journalctl -u household-docker-prune.service -n 50     # before/after `docker system df`
```

Tune without editing the script: `sudo systemctl edit household-docker-prune.service` and add
`Environment=DOCKER_BUILD_CACHE_KEEP=5GB` (or `DOCKER_IMAGE_PRUNE_AGE=72h`).
