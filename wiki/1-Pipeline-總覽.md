# 1. Pipeline 總覽

```
song.mp3 ──► Demucs (htdemucs, two-stems) ──► vocals.wav
   │                                            ├─► faster-whisper medium（人聲軌，word timestamps）
   │                                            ├─► onset 偵測（backtrack） + 包絡谷值音節偵測 ──► src/vocal.json
   ├─► faster-whisper medium（完整混音，fallback）
   ├─► librosa：beat / RMS / bass ──► src/audio.json
   └─► librosa：64-band mel 頻譜 + 示波器窗 ──► src/spectrum.bin, src/scope.bin

歌詞表 (src/lyrics.txt：唱的句子 | 翻譯字幕)
   └─► tools/align_v2.py：DP 對齊 → snap 到人聲 attack → 中文逐字 attack ──► src/timeline.json

src/storyboard.js（段落、鏡頭、版型、轉場） + src/fx_audio.js（audio-reactive）
   └─► render.js（每一幀都是 t 的純函數，@napi-rs/canvas）──► raw RGBA ──► ffmpeg ──► MP4
```

## 順序很重要
1. **先分析、再對齊、最後才設計。** 沒有可信的 timeline 就做 motion，等於在流沙上蓋房子。
2. **先做 diagnostics 工具**（`tools/plot_align.py`），再調參數。看不見的東西沒辦法校正。
3. **Renderer 必須 deterministic**：同一個 `t` 永遠畫出同一幀。這樣才能：
   - 任意時間點出 still 做檢查
   - 平行渲染、切段再接回去
   - 在 CI 上重現同一支影片

## 檔案對應
| 步驟 | 工具 | 輸出 |
|---|---|---|
| 人聲分離 | `python3 -m demucs --two-stems=vocals -n htdemucs song.mp3` | `vocals.wav` |
| 轉寫 | `tools/transcribe.py` | `src/whisper_vocals.json`, `src/whisper_mix.json` |
| 人聲 attack | `tools/vocal_onsets.py` | `src/vocal.json`（onsets、syll、env100） |
| 對齊 | `tools/align_v2.py` | `src/timeline.json` |
| 節拍與能量 | `tools/analyze_audio.py` | `src/audio.json` |
| 頻譜與波形 | `tools/audio_reactive.py` | `src/spectrum.bin`, `src/scope.bin` |
| 檢查 | `tools/plot_align.py` | PNG 對齊圖 |
| 渲染 | `render.js` / `build.sh` | MP4 |
