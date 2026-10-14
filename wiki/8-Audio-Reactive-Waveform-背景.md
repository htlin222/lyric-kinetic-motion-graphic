# 8. Audio-reactive：讓背景跟著聲音動

使用者問：「背景可以有配合聲音的 waveform motion design 嗎？」答案是可以，而且要用**真實的音訊數據**，不要用假的 loop。

## 數據（tools/audio_reactive.py）
- `spectrum.bin`：uint8，每幀 64 個 mel 頻帶，30–14000 Hz，dB 正規化（−70 到 0），做 fast-attack / slow-release 平滑。
- `scope.bin`：int8，每幀 192 點，取以該幀為中心 46 ms 的原始波形。
- 用 binary 不用 JSON：6800 幀 × 256 個值，JSON 太肥，讀取也慢。

## 每個段落一種設計
| 段落 | 設計 | 重點 |
|---|---|---|
| 副歌、終章 | **3D 頻譜山脊地形**：28 層歷史頻譜往深處排開，從舞台地板往鏡頭飛 | 頻譜做鏡像（低頻在中間），由遠畫到近，每層先填黑色遮住後面的層，最前面那條用亮金色 |
| 頒獎 glam | 環形頻譜，128 根放射狀線條 | 慢慢旋轉，每 8 根一根亮色 |
| 記者會 | 播報風格的 scope line，加上 3D video wall | scope 兩端做 taper，加 glow |
| 學院 | 鏡像 level meter 波形 | 用最近 2 秒的 RMS 歷史 |
| 警報 | 紅色示波器（心電圖感） | 線條要粗，glow 要強 |

## Video wall（讓「新聞背景輪播」不單調）
- 8 個面板放在 3D 空間裡，左右兩側朝內，有視差漂移。
- **每 8 拍換一次內容**，換的瞬間做 glitch 切。內容有：live spectrum、vox scope、confidence 音量表、雙語指數走勢、地球、ON AIR、EN⇄中 翻牌、international reach 地圖。
- 面板邊框隨 beat 變亮。
- 播報包裝還有：
  - HEADLINE 卡每 8 拍翻一次，英文版和中文版輪流出現（這本身就是笑點）
  - TAIPEI / LONDON / BOSTON 時鐘
  - 市場跑馬燈（中文 ▲、ENGLISH ▼、HESITATION ▼99%）
  - BREAKING 跑馬燈

## Lessons
- 背景的對比和透明度都要壓低（video wall alpha 約 0.7，scope 約 0.55），**字永遠是主角**。
- 背景圖層一開始一定要先**填滿不透明的底色**。v1 的警報段用了半透明的閃爍漸層，結果上一幀的字殘留在畫面上，變成鬼影。
