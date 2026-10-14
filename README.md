# lyric-kinetic-motion-graphic

**REVERSE JING-JING（逆晶晶體）** is a 3:46 kinetic-typography lyric film with 3D extruded type, show-reel transitions and Whisper-timed lyrics.

▶ **Watch:** see the [latest release](../../releases/latest) for the rendered MP4 (1080p30, H.264 + AAC).

See **[STORYBOARD.md](STORYBOARD.md)** for the full shot-by-shot design.

## How it works
```
song.mp3 ──► faster-whisper (medium, word timestamps) ──► DP alignment to the real lyrics ──► src/timeline.json
        └──► librosa (beats, RMS, bass envelope) ─────────────────────────────────────────► src/audio.json
src/storyboard.js (sections · scenes · layouts · transitions)
render.js  ── deterministic per-frame Canvas renderer (@napi-rs/canvas, pseudo-3D projection) ──► raw RGBA ──► ffmpeg ──► MP4
```

* **Alignment.** Whisper (`tools/transcribe.py`) transcribes the mixed English/中文 vocal. `tools/align.py` runs a Needleman–Wunsch alignment between the recognised words and the actual lyrics, using fuzzy token similarity. Lines Whisper skipped in the full pass (mostly 中文 or chant) are recovered by a second, windowed pass with lyric prompts (`tools/whisper_gaps.py`). Those fixes are recorded in `tools/build_timeline.py`. Untimed tokens are interpolated by text weight.
* **Engine.** Nothing is keyframed by hand. Every element is a pure function of time `t`, which makes the renderer frame-exact and parallel. Lyrics drive the appear time of every token. Beats drive pulses and glow. Each 中文 impact registers a shake and flash event.

## Render it yourself
```bash
npm ci
./tools/fetch-fonts.sh            # OFL fonts: Playfair Display, Anton, Cormorant Garamond, Noto Serif/Sans CJK TC
node render.js --stills 8.3,137.9 # preview frames -> out/stills
./build.sh path/to/song.mp3       # full render (parallel across cores) -> out/reverse-jing-jing.mp4
```
Re-timing: `python3 tools/transcribe.py medium` → `tools/align.py` → `tools/build_timeline.py src/aligned_raw.json src/timeline.json`.

Requires Node ≥ 18, ffmpeg, and Python 3 with `faster-whisper` and `librosa` (only for re-timing). Rendering takes about 100–250 ms per frame per core.

The song audio is not included in this repo.
