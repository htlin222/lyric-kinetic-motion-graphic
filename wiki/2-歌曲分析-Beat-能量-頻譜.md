# 2. 歌曲分析：Beat、能量、頻譜

## 要拿到的數據
| 數據 | 用途 |
|---|---|
| BPM / beat times（`librosa.beat.beat_track`） | glow 脈衝、video wall 換台（每 8 拍）、headline 翻牌 |
| RMS 能量（每幀） | 背景 bass zoom、level meter、段落辨識 |
| 低頻能量（STFT 前 20 bins） | 背景隨 bass 輕微縮放 |
| 64-band mel 頻譜（每幀，fast-attack / slow-release） | 3D ridgeline、radial ring、spectrum panel |
| 示波器窗（每幀 46 ms，192 點） | 播報風 scope line、紅色心電圖 |

這首歌是 **152 BPM**，一拍約 0.395 s，八分音符約 0.197 s。中文字幾乎都唱在八分音符上（雙語國際競爭力七個字間距約 0.2 s），這個數字之後可以拿來 sanity check 對齊結果。

## 用能量圖切段落
每 4 秒印一次平均 RMS 的長條（純文字就夠），看起來大概像這樣：
```
44  #################   ← 副歌開始
116 ##########
120 #######             ← breakdown（Please understand）
136 ##################  ← 雙語國際競爭力 爆點
```
能量曲線加上 Whisper 轉寫，就能把歌切成 intro / verse / pre / chorus / bridge / breakdown / outro，每一段指定一種視覺主題。

## Lessons
- **beat tracker 只用在「裝飾」，不要拿來決定字的時間。** 歌手不一定唱在拍點上，有搶拍、有拖拍。字要對的是人聲，不是鼓。
- 頻譜要做 **fast-attack / slow-release** 平滑（上升 0.7、下降 0.86 保留），不然畫面會抖得很廉價。
- 示波器窗要取以該幀為中心的 ±23 ms，而且兩端乘上 `sin` taper，線條的兩端才不會亂跳。
