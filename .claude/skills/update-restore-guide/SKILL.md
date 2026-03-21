---
name: update-restore-guide
description: Regenerate the NanoClaw personal restoration guide (RESTORE.md) with current groups, env vars, skills, and config. Use when setup changes (new groups, new secrets, new skills).
---

# Update Restoration Guide

Regenerate `~/PersonalDrive/nanoclaw-backup/RESTORE.md` with the current state of the installation.

## Steps

1. **Gather current state** — read all of these:
   - `.env` (keys only, not values — the guide should say where to get each token)
   - `~/.config/nanoclaw/mcp-gateways.json`
   - `~/.config/nanoclaw/mount-allowlist.json`
   - `~/Library/LaunchAgents/com.nanoclaw.plist`
   - `~/Library/LaunchAgents/com.nanoclaw.backup.plist`
   - Registered groups: `sqlite3 store/messages.db "SELECT jid, name, folder, trigger_pattern, requires_trigger, is_main, container_config FROM registered_groups;"`
   - Git remotes: `git remote -v`
   - Container skills: `ls container/skills/`
   - Claude skills: `ls .claude/skills/`
   - Node version: `node --version`
   - Container image: check `container/Dockerfile` base image
   - Emacs config: check `~/.doom.d/config.el` for claude-code-ide setup

2. **Read the existing RESTORE.md** at `~/PersonalDrive/nanoclaw-backup/RESTORE.md`

3. **Update it** with any changes found in step 1:
   - New/removed groups
   - New/removed env vars
   - New/removed skills
   - Changed config (mcp gateways, mount allowlist, launchd)
   - Updated troubleshooting tips if relevant

4. **Preserve the structure** — keep the same sections and format. Update the "Last updated" date at the top.

5. **Also run a backup** after updating: `./scripts/backup-groups.sh backup`

## Important

- Never write secret values into RESTORE.md — only key names and where to obtain them
- Keep it practical and concise — this is a recovery runbook, not documentation
- The target audience is Mikkel and Claude Code in a future conversation
