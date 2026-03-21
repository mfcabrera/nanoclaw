#!/usr/bin/env bash
#
# Backup/restore NanoClaw group configs to PersonalDrive.
# Backs up CLAUDE.md, *.json, *.py, *.md (excludes logs, conversations, agent-runner-src).
#
# Usage:
#   ./scripts/backup-groups.sh backup    # backup groups to PersonalDrive
#   ./scripts/backup-groups.sh restore   # restore groups from PersonalDrive
#   ./scripts/backup-groups.sh diff      # show what differs between local and backup
#

set -euo pipefail

NANOCLAW_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GROUPS_DIR="$NANOCLAW_DIR/groups"
CONTAINER_SKILLS_DIR="$NANOCLAW_DIR/container/skills"
CLAUDE_SKILLS_DIR="$NANOCLAW_DIR/.claude/skills"
BACKUP_DIR="$HOME/PersonalDrive/nanoclaw-backup"
BACKUP_GROUPS="$BACKUP_DIR/groups"
BACKUP_CONFIG="$BACKUP_DIR/config"
BACKUP_CONTAINER_SKILLS="$BACKUP_DIR/container-skills"
BACKUP_CLAUDE_SKILLS="$BACKUP_DIR/claude-skills"

# Also backup these config files (non-secret)
CONFIG_FILES=(
  "$HOME/.config/nanoclaw/mcp-gateways.json"
  "$NANOCLAW_DIR/.claude/settings.local.json"
)

RSYNC_EXCLUDES=(
  --exclude='logs/'
  --exclude='conversations/'
  --exclude='agent-runner-src/'
  --exclude='.DS_Store'
)

backup() {
  echo "Backing up groups from $GROUPS_DIR"
  mkdir -p "$BACKUP_GROUPS" "$BACKUP_CONFIG"

  for group_dir in "$GROUPS_DIR"/*/; do
    group_name="$(basename "$group_dir")"
    echo "  -> $group_name"
    mkdir -p "$BACKUP_GROUPS/$group_name"
    rsync -a --delete "${RSYNC_EXCLUDES[@]}" "$group_dir" "$BACKUP_GROUPS/$group_name/"
  done

  # Backup container skills (agent-side: ynab, seedbox, rutorrent, etc.)
  if [ -d "$CONTAINER_SKILLS_DIR" ]; then
    echo "Backing up container skills"
    mkdir -p "$BACKUP_CONTAINER_SKILLS"
    rsync -a --delete --exclude='.DS_Store' "$CONTAINER_SKILLS_DIR/" "$BACKUP_CONTAINER_SKILLS/"
    for skill in "$CONTAINER_SKILLS_DIR"/*/; do
      echo "  -> container skill: $(basename "$skill")"
    done
  fi

  # Backup claude skills (host-side: setup, customize, debug, etc.)
  if [ -d "$CLAUDE_SKILLS_DIR" ]; then
    echo "Backing up claude skills"
    mkdir -p "$BACKUP_CLAUDE_SKILLS"
    rsync -a --delete --exclude='.DS_Store' "$CLAUDE_SKILLS_DIR/" "$BACKUP_CLAUDE_SKILLS/"
    for skill in "$CLAUDE_SKILLS_DIR"/*/; do
      echo "  -> claude skill: $(basename "$skill")"
    done
  fi

  # Backup config files
  for cfg in "${CONFIG_FILES[@]}"; do
    if [ -f "$cfg" ]; then
      mkdir -p "$BACKUP_CONFIG"
      cp "$cfg" "$BACKUP_CONFIG/$(basename "$cfg")"
      echo "  -> config: $(basename "$cfg")"
    fi
  done

  # Backup .env (secrets file)
  if [ -f "$NANOCLAW_DIR/.env" ]; then
    cp "$NANOCLAW_DIR/.env" "$BACKUP_CONFIG/dot-env"
    echo "  -> secrets: .env"
  fi

  echo ""
  echo "Backup complete: $BACKUP_DIR"
  echo "Timestamp: $(date -Iseconds)" > "$BACKUP_DIR/last-backup.txt"
  cat "$BACKUP_DIR/last-backup.txt"
}

restore() {
  if [ ! -d "$BACKUP_GROUPS" ]; then
    echo "No backup found at $BACKUP_GROUPS"
    exit 1
  fi

  if [ -f "$BACKUP_DIR/last-backup.txt" ]; then
    echo "Restoring from backup ($(cat "$BACKUP_DIR/last-backup.txt"))"
  fi

  for group_dir in "$BACKUP_GROUPS"/*/; do
    group_name="$(basename "$group_dir")"
    echo "  <- $group_name"
    mkdir -p "$GROUPS_DIR/$group_name"
    rsync -a "${RSYNC_EXCLUDES[@]}" "$group_dir" "$GROUPS_DIR/$group_name/"
  done

  # Restore container skills
  if [ -d "$BACKUP_CONTAINER_SKILLS" ]; then
    echo "Restoring container skills"
    mkdir -p "$CONTAINER_SKILLS_DIR"
    rsync -a "$BACKUP_CONTAINER_SKILLS/" "$CONTAINER_SKILLS_DIR/"
    for skill in "$BACKUP_CONTAINER_SKILLS"/*/; do
      echo "  <- container skill: $(basename "$skill")"
    done
  fi

  # Restore claude skills
  if [ -d "$BACKUP_CLAUDE_SKILLS" ]; then
    echo "Restoring claude skills"
    mkdir -p "$CLAUDE_SKILLS_DIR"
    rsync -a "$BACKUP_CLAUDE_SKILLS/" "$CLAUDE_SKILLS_DIR/"
    for skill in "$BACKUP_CLAUDE_SKILLS"/*/; do
      echo "  <- claude skill: $(basename "$skill")"
    done
  fi

  # Restore .env (secrets file)
  if [ -f "$BACKUP_CONFIG/dot-env" ]; then
    cp "$BACKUP_CONFIG/dot-env" "$NANOCLAW_DIR/.env"
    echo "  <- secrets: .env"
  fi

  # Restore config files
  if [ -d "$BACKUP_CONFIG" ]; then
    for cfg in "${CONFIG_FILES[@]}"; do
      local_name="$(basename "$cfg")"
      if [ -f "$BACKUP_CONFIG/$local_name" ]; then
        mkdir -p "$(dirname "$cfg")"
        cp "$BACKUP_CONFIG/$local_name" "$cfg"
        echo "  <- config: $local_name"
      fi
    done
  fi

  echo ""
  echo "Restore complete. Restart nanoclaw to pick up changes."
}

show_diff() {
  if [ ! -d "$BACKUP_GROUPS" ]; then
    echo "No backup found at $BACKUP_GROUPS"
    exit 1
  fi

  echo "Differences (local vs backup):"
  echo ""
  rsync -na --delete "${RSYNC_EXCLUDES[@]}" "$GROUPS_DIR/" "$BACKUP_GROUPS/" | grep -v '^\.' || echo "  (no differences)"
}

case "${1:-}" in
  backup)  backup ;;
  restore) restore ;;
  diff)    show_diff ;;
  *)
    echo "Usage: $0 {backup|restore|diff}"
    exit 1
    ;;
esac
