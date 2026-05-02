#!/usr/bin/env bash
#
# NanoClaw watchdog — restarts the service if it appears stuck.
#
# Checks:
# 1. Process is running
# 2. No repeated decryption failures (stale session)
# 3. Log file has been written to recently (not frozen)
#
# Run via launchd every 10 minutes.
#

set -euo pipefail

LOG="/Users/mfcabrera/src/nanoclaw/nanoclaw/logs/nanoclaw.log"
WATCHDOG_LOG="/Users/mfcabrera/src/nanoclaw/nanoclaw/logs/watchdog.log"
SERVICE="gui/$(id -u)/com.nanoclaw"

log() {
  echo "$(date -Iseconds) $1" >> "$WATCHDOG_LOG"
}

# Check 1: Is the process running at all?
if ! launchctl list | grep -q 'com.nanoclaw$'; then
  log "RESTART: process not found in launchctl"
  launchctl kickstart -k "$SERVICE"
  exit 0
fi

# Check 2: Has the log been updated in the last 15 minutes?
if [ -f "$LOG" ]; then
  last_mod=$(stat -f %m "$LOG")
  now=$(date +%s)
  age=$(( now - last_mod ))
  if [ "$age" -gt 900 ]; then
    log "RESTART: log file stale (${age}s since last write)"
    launchctl kickstart -k "$SERVICE"
    exit 0
  fi
fi

# Check 3: Too many decryption failures in the last 5 minutes = stale session
if [ -f "$LOG" ]; then
  recent_errors=$(tail -500 "$LOG" | grep -c "No session found to decrypt" 2>/dev/null || true)
  if [ "$recent_errors" -gt 10 ]; then
    log "RESTART: $recent_errors decryption failures detected (stale session)"
    launchctl kickstart -k "$SERVICE"
    exit 0
  fi
fi

# All good
exit 0
