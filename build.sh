#!/usr/bin/env bash
# One-command render: ./build.sh path/to/song.mp3   ->  out/reverse-jing-jing.mp4
set -euo pipefail
cd "$(dirname "$0")"
SONG=${1:-song.mp3}
[ -d node_modules ] || npm ci
./tools/fetch-fonts.sh
JOBS=${JOBS:-$(nproc)}
DUR=226.4
mkdir -p out
pids=()
for ((i=0;i<JOBS;i++)); do
  A=$(python3 -c "print($DUR*$i/$JOBS)"); B=$(python3 -c "print($DUR*($i+1)/$JOBS)")
  node render.js --from "$A" --to "$B" --out "out/part$i.mp4" & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
: > out/parts.txt; for ((i=0;i<JOBS;i++)); do echo "file 'part$i.mp4'" >> out/parts.txt; done
ffmpeg -y -loglevel error -f concat -safe 0 -i out/parts.txt -i "$SONG" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/reverse-jing-jing.mp4
echo "→ out/reverse-jing-jing.mp4"
