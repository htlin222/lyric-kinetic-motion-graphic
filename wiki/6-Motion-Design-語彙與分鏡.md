# 6. Motion Design 語彙與分鏡

## 先定概念，再定規則
這首歌在諷刺「國際菁英」式的中英混雜，所以視覺概念是**浮誇的頒獎典禮兼記者會**：金箔、亮片、旋轉地球、新聞跑馬燈，加上故作正經的襯線字。完整分鏡見 repo 的 `STORYBOARD.md`。

## 兩套動態語彙（整支片最重要的設計決定）
| | English | 中文 |
|---|---|---|
| 字體 | Playfair Display Italic，象牙白 | Noto Serif CJK TC Black，金色 |
| 進場 | 滑入，帶殘影，很輕 | 砸下，像印章 |
| 深度 | 平的 | 12 層擠出，朝消失點方向延伸 |
| 落地 | 柔光 | 震動、白閃、色差、紅色印章框、墨點 |

副歌的 REVERSE 用 Anton 字體，字母由右往左進場、從鏡像翻正（鏡像時是紅色），下方有地板倒影，背後是鏡像字牆。

## 版型（storyboard 的 layout）
`center`、`stack`（多句堆疊）、`ladder`（越來越大）、`split`（VS 對決）、`hero`（巨字＋皇冠）、`chorus`、`type`（打字機）、`climax`（逐字爆點）、`list`（打勾清單）。

## 歌詞裡的笑點，要做成視覺 gag
- "You don't say 'residential power' / You say 民生用電"：英文句在中文砸下的瞬間被紅線劃掉。
- "This is not 卡住 / This is strategy"：紅色 ✕ 劃過中文。
- "Cross-strait relations / Getting heavy"：字被重量往下拉。
- "um, I would say…"：打字機加閃爍游標，像是講者卡住了。
- "Maximum flexibility / Minimum hesitation"：一大一小的比例 gag。
- "ALL HAIL THE KING"：3D 金皇冠掉下來。

## 假 3D（Canvas 2D 就能做）
- **擠出**：同一段文字往消失點方向疊畫 12–18 層深金色，再蓋上漸層金字。
- **yaw**：用 `scaleX = cos(angle)` 模擬繞 Y 軸旋轉，配合 `Math.sign` 做鏡像翻轉。
- **透視投影**：`s = FOC / z`，粒子、隧道、柱廊、地板格線、ridgeline 都用這個公式。
- **鏡頭**：每個 shot 都慢慢 dolly in（+1.8%/s）加一點旋轉漂移；背景鏡頭往前飛，速度依段落而定。

## 版面規則
- 字幕（翻譯）固定在下方，旁邊加一條金色細線；有跑馬燈時要往上讓位。
- 文字的安全區要避開 video wall、時鐘、LIVE bug。
