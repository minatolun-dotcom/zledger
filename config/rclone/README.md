# Google Drive Backup Setup

Zledger can automatically upload backups to your personal Google Drive.

## Setup (one-time, ~2 minutes)

### 1. Install rclone (if not already installed)

**Linux/macOS:**
```bash
curl https://rclone.org/install.sh | sudo bash
```

**Windows:** Download from https://rclone.org/download/

**Docker (alternative):** You can run the authorize command inside the backup container:
```bash
docker compose run --rm backup rclone authorize gdrive
```

### 2. Authorize rclone with your Google account

Run this command on a machine with a **browser**:
```bash
rclone authorize gdrive
```

This will:
1. Open your browser to Google's sign-in page
2. Ask you to sign in and grant rclone access to your Drive
3. Print a JSON token to the terminal

### 3. Copy the token

After authorizing, rclone will output something like:
```
{
  "access_token": "ya29.a0AfH...",
  "refresh_token": "1//0gX...",
  "token_type": "Bearer",
  "expiry": "2026-07-07T15:00:00Z"
}
```

**Copy the entire JSON output** (including the curly braces) and paste it into:
```
config/rclone/token.json
```

### 4. Enable in .env

Add to your `.env` file:
```
GDRIVE_ENABLED=true
```

### 5. Restart the backup service

```bash
docker compose restart backup
```

## How It Works

- After each local backup, the backup service uploads files to a folder on your Google Drive
- The folder name defaults to `zledger-backups` (configurable via `GDRIVE_REMOTE_PATH`)
- **All backups are kept on Drive** — no automatic rotation
- The backup status endpoint shows sync status and history
- Backups are uploaded as soon as they're created locally

## Troubleshooting

**"token file not found" error:**
- Make sure `config/rclone/token.json` exists and contains valid JSON
- Check the file permissions: `ls -la config/rclone/token.json`

**"invalid_grant" or token expired:**
- rclone automatically refreshes tokens, but if it fails:
  1. Re-run `rclone authorize gdrive`
  2. Update `config/rclone/token.json` with the new token
  3. Restart: `docker compose restart backup`

**Backups not uploading:**
- Check logs: `docker compose logs backup`
- Verify `GDRIVE_ENABLED=true` in `.env`
- Check the backup status API for sync errors
