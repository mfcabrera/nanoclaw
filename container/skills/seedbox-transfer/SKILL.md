---
name: seedbox-transfer
description: Full pipeline to add a torrent/magnet/webpage to ruTorrent, monitor until complete, then auto-copy to the correct location on the Synology NAS. Use when user shares a magnet link, torrent URL, or torrent site page and wants it downloaded and transferred.
allowed-tools: Bash(curl:*), Bash(~/rclone:*), Bash(cat:*), Bash(echo:*), Bash(python3:*)
---

# Seedbox → NAS Transfer Pipeline

Full end-to-end workflow: add torrent → monitor → auto-copy to NAS.

## Connection Details

### Seedbox (ruTorrent)
- **API**: https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php
- **Auth**: rapidseedbox53414 / (env var `SEEDBOX_PASSWORD`)
- **SFTP**: port 63526

### NAS (Synology Cabreletvault)
- **Host**: Cabreletvault
- **User**: mikkel / (env var `NAS_PASSWORD`)
- **rclone config**: ~/.config/rclone/rclone.conf
- **rclone binary**: ~/rclone

## NAS Folder Structure

```
nas:video/
  Movies/
    {download-year}/          ← e.g. 2026
      {Folder Name}/
  Series/
    {download-year}/          ← e.g. 2026
    Classics/
    Lala/
    Otros/
  Instructionals/
    BJJ_Videos/
      {Instructor - Title}/
```

## Quality & Compatibility Preferences

When browsing torrent sites or choosing between releases, **always apply these preferences**:

### Resolution
- **Prefer 2160p (4K)** over 1080p whenever available
- Only fall back to 1080p if no 2160p release exists

### HDR Format (priority order)
Mikkel's TV is a **Sony Bravia S90F** which supports:
1. **HDR10+** ← preferred
2. **Dolby Vision** ← also great
3. **HDR10** ← acceptable fallback
4. SDR ← last resort only

### Codec
- **x265 / HEVC** preferred (smaller file, better quality at 4K)
- Avoid AV1 unless no x265 option exists

### Audio
- Dolby Atmos or DTS:X preferred
- DDP5.1 / TrueHD acceptable

### Release Tags to Look For (in priority order)
```
2160p HDR10+      ← ideal
2160p DV          ← great
2160p HDR         ← good
1080p HDR10+      ← fallback
1080p             ← last resort
```

### When Multiple Releases Exist
Pick the one that best matches: `2160p + HDR10+ or DV + x265 + good audio`
Example of a good release name: `Movie.2024.2160p.ATVP.WEB-DL.DDP5.1.HDR10Plus.x265`

---

## Step 1: Extract Magnet from Webpage (if needed)

If user gives a URL (not a magnet), use agent-browser to open the page and find the magnet link or .torrent download button. Apply quality preferences above when multiple options are available on the page.

## Step 2: Add Magnet to ruTorrent

```bash
MAGNET="magnet:?xt=urn:btih:..."
curl -s -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php" \
  --data "<?xml version=\"1.0\"?><methodCall><methodName>load.start</methodName><params><param><value><string></string></value></param><param><value><string>${MAGNET}</string></value></param></params></methodCall>" \
  -H "Content-Type: text/xml"
```

Success = `<i8>0</i8>` in response.

## Step 3: Get Torrent Hash (after adding)

```bash
# List all torrents and get the most recently added hash
curl -s -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php" \
  --data '<?xml version="1.0"?><methodCall><methodName>download_list</methodName></methodCall>' \
  -H "Content-Type: text/xml" | grep -o '<string>[^<]*</string>' | sed 's/<[^>]*>//g'
```

## Step 4: Save to Pending File

Save to `/workspace/group/pending_torrents.json`:
```json
{
  "HASH": {
    "name": "Severance (2022) Season 2",
    "category": "Series",
    "nas_year": "2026",
    "added_at": "2026-02-27T09:00:00Z"
  }
}
```

## Step 5: Check Torrent Completion

```bash
# Check if a specific torrent is complete (replace HASH)
curl -s -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php" \
  --data '<?xml version="1.0"?><methodCall><methodName>d.complete</methodName><params><param><value><string>HASH</string></value></param></params></methodCall>' \
  -H "Content-Type: text/xml"
# Returns <i8>1</i8> if complete, <i8>0</i8> if not
```

## Step 6: Copy to NAS with rclone

```bash
# Movies
~/rclone copy "seedbox:FOLDER_NAME" "nas:video/Movies/2026/FOLDER_NAME" \
  --config ~/.config/rclone/rclone.conf \
  --progress

# Series
~/rclone copy "seedbox:FOLDER_NAME" "nas:video/Series/2026/FOLDER_NAME" \
  --config ~/.config/rclone/rclone.conf \
  --progress

# Instructionals (BJJ)
~/rclone copy "seedbox:FOLDER_NAME" "nas:video/Instructionals/BJJ_Videos/FOLDER_NAME" \
  --config ~/.config/rclone/rclone.conf \
  --progress
```

## Step 7: Delete from ruTorrent (after successful copy)

Once rclone copy completes successfully, remove the torrent from ruTorrent to free up seedbox space:

```bash
# d.erase removes torrent + data files from the seedbox
curl -s -u "rapidseedbox53414:$SEEDBOX_PASSWORD" \
  "https://rapidseedbox53414-rt.swift-013.seedbox.vip/plugins/httprpc/action.php" \
  --data '<?xml version="1.0"?><methodCall><methodName>d.erase</methodName><params><param><value><string>HASH</string></value></param></params></methodCall>' \
  -H "Content-Type: text/xml"
```

Returns `<i8>0</i8>` on success.

**Important**: Only delete AFTER rclone has exited with code 0 (successful copy). Never delete if rclone failed.

## Auto-Categorization Logic

### Instructionals (check first)
Keywords in folder name → `Instructionals/BJJ_Videos/`:
- Instructor names: Gordon Ryan, Roger Gracie, Lucas Leite, Buchecha, Tom DeBlass, Marcelo Garcia, John Danaher, Craig Jones, Bernardo Faria
- Keywords: "Guard", "Half Guard", "Escapes", "Fundamentals", "Gi Courses", "No-Gi", "Instructional", "BJJ", "Jiu-Jitsu", "Wrestling", "MMA"

### Series (check second)
- Contains `S\d\dE\d\d` pattern (e.g. S02E01)
- Contains "Season X"
- Contains known series indicators

### Movies (default for video content)
- Has year in parentheses: `(2024)` or `(2025)`
- Contains quality tags: `1080p`, `2160p`, `BluRay`, `WEB-DL`, `REPACK`
- No season/episode markers

### Unclear
- Ask the user which category before transferring

## NAS Year for Subdirectory

Use the **current year** (when download was initiated), NOT the release year of the content.
- Current year: use `date +%Y`
- Exception: "Classics" folder exists for old content if user specifies

## Pending Torrents File

Location: `/workspace/group/pending_torrents.json`

Read/write this file to track in-progress transfers. The monitoring task checks this file.

## Monitoring

A scheduled task runs every 5 minutes checking pending_torrents.json.
When a torrent completes: copy to NAS → notify user → remove from pending.

## Usage Examples

- User: "add this magnet to download and transfer: magnet:?xt=..."
- User: "download this and put it on my NAS: https://torrent-site.com/thing"
- User: "/rutorrent https://..." (webpage — use agent-browser to extract magnet)
