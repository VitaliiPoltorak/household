# rclone setup for database backups (#306)

One-time setup on the production VPS, as the user that owns `/opt/household`
(`vitaliy` on this VPS — same user `household-backup.service` runs as).

## 1. Create the R2 bucket + API token

In the Cloudflare dashboard (same account as Cloudflare Pages, already in
use for the web app):

1. R2 → Create bucket → `household-backups`. Any region; R2 has no egress
   fees, which is the main reason it was picked over S3.
2. R2 → Manage API Tokens → Create API Token → permissions scoped to just
   this bucket (Object Read & Write). Note the Access Key ID, Secret Access
   Key, and your Account ID (shown in the R2 dashboard URL and in the
   token's "S3 API" endpoint).

## 2. Install rclone and generate the config

```bash
sudo apt-get install -y rclone   # or curl https://rclone.org/install.sh | sudo bash

# Generate two obscured secrets for the crypt remote — DO NOT reuse a
# password you use anywhere else, and store both somewhere durable (a
# password manager) outside the VPS. Losing them makes every existing
# backup permanently unreadable.
rclone obscure "$(openssl rand -base64 32)"   # -> password
rclone obscure "$(openssl rand -base64 32)"   # -> password2 (a different value)
```

Copy `infra/rclone/rclone.conf.example` to
`/opt/household/.config/rclone/rclone.conf` (owned by the same user as
`/opt/household`, mode `600`) and fill in the four `REPLACE_WITH_*`
placeholders with the values from steps 1–2.

This path is NOT rclone's default config location (`~/.config/rclone/...`)
— it lives under `/opt/household` so it doesn't depend on whichever user's
home directory ends up running the timer. Point rclone at it explicitly by
setting `RCLONE_CONFIG=/opt/household/.config/rclone/rclone.conf` in
`/opt/household/.env.backup` (see `.env.example`) — `household-backup.service`
loads that file, and it's also what "Verify" below exports manually.

## 3. Verify

```bash
export RCLONE_CONFIG=/opt/household/.config/rclone/rclone.conf
echo hello | rclone rcat r2-crypt:household-backups/smoke-test.txt
rclone cat r2-crypt:household-backups/smoke-test.txt   # -> hello
rclone delete r2-crypt:household-backups/smoke-test.txt

# Confirm objects are actually encrypted at the R2 end — this should show
# an unreadable, encrypted filename, NOT smoke-test.txt:
rclone lsf r2:household-backups
```

If the last command ever shows plaintext filenames like
`household-<timestamp>.pgdump`, the crypt remote isn't wired up correctly —
`scripts/backup-database.sh` must point at `r2-crypt:...`, never `r2:...`
directly.
