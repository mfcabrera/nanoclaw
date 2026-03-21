---
name: rutorrent
description: Add magnets or torrent files to Mikkel's ruTorrent seedbox. Use when the user wants to add a torrent, magnet link, or download something via BitTorrent. For full pipeline (add + auto-transfer to NAS), use the seedbox-transfer skill instead.
allowed-tools: Bash(curl:*), Bash(python3:*), Bash(cat:*), Bash(echo:*)
---

# ruTorrent Skill

Adds magnet links or .torrent file URLs to Mikkel's ruTorrent seedbox via the rTorrent XML-RPC API.

## Connection Details

- **URL**: https://rapidseedbox53414-rt.swift-013.seedbox.vip/
- **Username**: rapidseedbox53414
- **Password**: (from env var `SEEDBOX_PASSWORD`)
- **API Endpoint**: https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php

## Adding a Magnet Link

```bash
curl -s -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php" \
  --data '<?xml version="1.0"?><methodCall><methodName>load.start</methodName><params><param><value><string></string></value></param><param><value><string>MAGNET_LINK_HERE</string></value></param></params></methodCall>' \
  -H "Content-Type: text/xml"
```

## Adding a .torrent File URL

```bash
curl -s -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php" \
  --data '<?xml version="1.0"?><methodCall><methodName>load.start</methodName><params><param><value><string></string></value></param><param><value><string>TORRENT_URL_HERE</string></value></param></params></methodCall>' \
  -H "Content-Type: text/xml"
```

## Listing Current Torrents

```bash
curl -s -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php" \
  --data '<?xml version="1.0"?><methodCall><methodName>download_list</methodName><params></params></methodCall>' \
  -H "Content-Type: text/xml"
```

## Success Response

A successful add returns:
```xml
<?xml version="1.0"?><methodResponse><params><param><value><i8>0</i8></value></param></params></methodResponse>
```

(`<i8>0</i8>` = success)

## Full Pipeline (Add + Auto-Transfer to NAS)

When user wants the torrent to also be transferred to the NAS automatically:
1. Add the magnet/torrent using the method above
2. Save the torrent info to `/workspace/group/pending_torrents.json`:

```python
import json, datetime

pending_file = "/workspace/group/pending_torrents.json"
with open(pending_file) as f:
    pending = json.load(f)

pending["HASH"] = {
    "name": "Folder Name on Seedbox",
    "category": "Series",  # or "Movies" or "Instructionals"
    "nas_year": datetime.datetime.now().strftime("%Y"),
    "added_at": datetime.datetime.utcnow().isoformat() + "Z"
}

with open(pending_file, "w") as f:
    json.dump(pending, f, indent=2)
```

A monitoring task runs every 5 minutes, detects completion, and copies to NAS automatically.

## Usage

Trigger: `/rutorrent`

Examples:
- `/rutorrent add magnet:?xt=urn:btih:...` — just add to seedbox
- `/rutorrent list` — show current torrents
- "download X and put it on my NAS" → use seedbox-transfer skill for full pipeline
