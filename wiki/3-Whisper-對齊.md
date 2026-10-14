# 3. Whisper 對齊：好用，但不能信

## 設定（faster-whisper，CPU int8）
```python
m = WhisperModel('medium', device='cpu', compute_type='int8')
segs, _ = m.transcribe(audio_np, word_timestamps=True, vad_filter=False,
                       condition_on_previous_text=False, beam_size=5,
                       initial_prompt="Reverse Jing-Jing. Welcome to Harvard. 政治細節 中文 民生用電 兩岸關係 雙語國際競爭力")
```
- `word_timestamps=True`：一定要開。
- `condition_on_previous_text=False`：避免它重複前面的句子、產生幻覺迴圈。
- `initial_prompt` 放專有名詞與中英混雜的關鍵字，辨識率會明顯變好。
- `vad_filter=False`：唱歌的時候 VAD 會把拉長音、和聲切掉。
- 坑：`faster-whisper` 和新版 `av` 不相容（`metadata_errors` 錯誤）。**先用 ffmpeg 轉成 16 kHz mono wav，用 soundfile 讀成 numpy 陣列再丟進去**，就能繞過。

## Whisper 在這首歌上犯的錯（真實紀錄）
| 現象 | 例子 |
|---|---|
| 整段漏掉 | 完整混音版漏掉 42.9–54.6 s（非常國際化、REVERSE JING-JING、ALL HAIL THE KING…） |
| 中文被轉成拼音或英文 | 民生用電 → "nin shen yong den"；中文 → "German" / "Joan" / "Jolin"；專有名詞 → "Chuan You Ming Si" |
| 中文被聽成別的詞 | 雙語國際競爭力 → 「雙語國際金正麗」 |
| segment 起點 ≠ 字的起點 | "Welcome" 標在 12.00，實際人聲從 12.37 才開始（前面是靜音） |
| segment 邊界的字時間不準 | outro 的 "Bilingual" 晚了 0.9 s |
| **歌詞表沒寫的重複** | 「Reverse Jing Jing」實際唱了兩次，歌詞表只寫一次 |

## 正確用法：Whisper 只當「錨點」，不當答案
1. **用已知歌詞當 ground truth。** 歌詞英文 token 和 Whisper 英文 token 做 **Needleman–Wunsch 全域對齊**，相似度用 `difflib.SequenceMatcher` ratio，大於 0.55 才算 match。
2. 中文 token 通常 match 不到，就**夾在前後兩個錨點之間**，再交給下一步的 waveform 校正。
3. **跑兩次 Whisper**：一次在人聲軌（主要），一次在完整混音（fallback）。有時候某一版會漏字，另一版剛好有。
4. 漏掉的整段，**對那個時間窗再跑一次 Whisper**，並把那段歌詞當 `initial_prompt`。這一招救回了 42–56 s 和 82–92 s。
5. **把 Whisper 的轉寫和歌詞表逐句比對，找出重複。** 歌詞表常常省略重唱的 hook。這次漏掉的兩次 chant，直接造成 1:45 和 2:48 的「卡頓」（見第 7 頁）。

## 千萬不要做的事
- ❌ 把一整句中文**平均分配**時間。v1 的「雙語國際競爭力」就是這樣做的，最多差了 0.8 s，使用者一眼就看出來。
- ❌ 直接用 segment 的 start 當第一個字的時間。
