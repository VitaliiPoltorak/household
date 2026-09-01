# household-backup systemd units

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
