---
name: seedbox-sftp
description: Browse, list, and download files from Mikkel's RapidSeedbox via SFTP. Use when the user wants to see what's on the seedbox, download a file, or manage seedbox files.
allowed-tools: Bash(curl:*), Bash(scp:*), Bash(sftp:*)
---

# Seedbox SFTP Skill

Access Mikkel's RapidSeedbox files over SFTP.

## Connection Details

- **Host**: rapidseedbox53414-rt.swift-013.seedbox.vip
- **IP**: 212.7.200.73
- **Port**: 63526 (Swift plan uses non-standard port!)
- **Username**: rapidseedbox53414
- **Password**: (from env var `SEEDBOX_PASSWORD`)
- **Protocol**: SFTP (SSH File Transfer Protocol)

## List Files (root directory)

```bash
curl -s --insecure -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "sftp://rapidseedbox53414-rt.swift-013.seedbox.vip:63526/" \
  --connect-timeout 15
```

## List Files in Subdirectory

```bash
curl -s --insecure -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "sftp://rapidseedbox53414-rt.swift-013.seedbox.vip:63526/FOLDER_NAME/" \
  --connect-timeout 15
```

## Download a File

```bash
curl --insecure -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "sftp://rapidseedbox53414-rt.swift-013.seedbox.vip:63526/FOLDER/filename.mkv" \
  -o /tmp/filename.mkv \
  --connect-timeout 15
```

## Download with Progress

```bash
curl --insecure -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "sftp://rapidseedbox53414-rt.swift-013.seedbox.vip:63526/FOLDER/filename.mkv" \
  -o /tmp/filename.mkv \
  --progress-bar \
  --connect-timeout 15
```

## Notes

- Files are read-only on the seedbox (`r--------` permissions)
- Directories are also read-only from SFTP side (`dr-x------`)
- The root directory contains torrent download folders and .ovpn files

## Known Files (as of Feb 2026)

- `Pillars Of Defense - Pin Escapes by Gordon Ryan/`
- `Arunkrishnan P. 3D Printing. A practical and hands-on textbook...2026/`
- `Chespirito/`
- `Roger Gracie TV - Gi Courses/`
- `Scooby Doo Where Are You/`
- `caballeros del zodiaco (todos los capitulos) español latino/`
- `rapidseedbox.ovpn`
- `rapidseedbox-windows.ovpn`

## Usage

Trigger: `/sftp` or `/seedbox`

Examples:
- `/sftp list` — list all files on seedbox
- `/sftp list Roger Gracie` — list contents of a specific folder
- `/sftp download filename.mkv` — download a specific file
- "what's on my seedbox?" — list files
- "download X from my seedbox" — download a file
