# lyric-kinetic-motion-graphic

**REVERSE JING-JING（逆晶晶體）** is a 3:46 kinetic-typography lyric film with 3D extruded type, audio-reactive waveform backgrounds, show-reel transitions and lyrics timed to the waveform.

**作者 · Song by [Benson Hung](https://www.youtube.com/@hbshun)**

▶ **Watch:** see the [latest release](../../releases/latest) for the rendered MP4 (1080p30, H.264 + AAC).

See **[STORYBOARD.md](STORYBOARD.md)** for the full shot-by-shot design.

## How it works
```
song.mp3 ─► Demucs (htdemucs) ─► vocals.wav ─┬─► faster-whisper medium (word timestamps) ─┐
         └──────────────────────────────────┼─► faster-whisper on full mix (fallback) ───┼─► DP match to real lyrics ─► snap to vocal attacks ─► src/timeline.json
                                            └─► onset + envelope-valley syllable detection ┘
song.mp3 ─► librosa: beats · mel spectrum · oscilloscope ─► src/audio.json, src/spectrum.bin, src/scope.bin
src/storyboard.js + src/fx_audio.js ─► render.js (deterministic per-frame Canvas, pseudo-3D) ─► raw RGBA ─► ffmpeg ─► MP4
```

**Sync.** The word you see should appear at the moment you hear it.
1. `tools/transcribe.py` runs Whisper on the **isolated vocal stem** (Demucs), with the full mix as a fallback.
2. `tools/align_v2.py` aligns the recognised words to the real lyrics with Needleman–Wunsch.
3. Every word start is **snapped to the nearest backtracked vocal attack** (`tools/vocal_onsets.py`). A word that Whisper places in silence moves forward to the first voiced attack.
4. Each **中文 character gets its own syllable attack**, taken from envelope-valley detection. A DP picks exactly *n* attacks inside the word's span.
5. Every section was checked by eye with `tools/plot_align.py`, which draws the vocal waveform, beat grid, attacks and word markers. The few remaining fixes are listed in `align_v2.py` (`WIN`, `CHARS`, `TOK`).
6. In the renderer, each visual impact (stamp, slam, chorus letter, shake, flash) lands on the attack +20 ms. Slams start 110 ms before.

**Audio-reactive backgrounds.** These come from the real track (64-band mel spectrum and oscilloscope, 30 fps):
* Choruses: a 3D spectrum ridgeline terrain flying across the stage floor.
* Code-switch section: a radial spectrum ring.
* Press sections: a broadcast scope line and a live video wall (spectrum, vox scope, level meter, 雙語指數 chart, ON AIR, language flip, reach map).
* Alert section: a red oscilloscope.

## Render it yourself
```bash
npm ci
./tools/fetch-fonts.sh            # OFL fonts: Playfair Display, Anton, Cormorant Garamond, Noto Serif/Sans CJK TC
node render.js --stills 8.3,137.9 # preview frames -> out/stills
./build.sh path/to/song.mp3       # full render (parallel across cores) -> out/reverse-jing-jing.mp4
```
Re-timing:
```bash
python3 -m demucs --two-stems=vocals -n htdemucs song.mp3          # -> separated/htdemucs/song/vocals.wav
python3 tools/vocal_onsets.py separated/htdemucs/song/vocals.wav  # -> src/vocal.json
python3 tools/align_v2.py                                         # -> src/timeline.json
python3 tools/audio_reactive.py song.mp3                          # -> src/spectrum.bin, src/scope.bin
python3 tools/plot_align.py separated/htdemucs/song/vocals.wav 134 139 out/check.png   # visual check
```

Requires Node ≥ 18, ffmpeg, and Python 3 with `faster-whisper`, `demucs` and `librosa` (only for re-timing). Rendering takes about 100–250 ms per frame per core.

The song audio is not included in this repo.
