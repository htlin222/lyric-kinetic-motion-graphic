import json,sys
from faster_whisper import WhisperModel
import soundfile as sf
audio,_=sf.read(sys.argv[2] if len(sys.argv)>2 else 'vocals16k.wav',dtype='float32')
m=WhisperModel(sys.argv[1],device='cpu',compute_type='int8',cpu_threads=2)
segs,info=m.transcribe(audio,word_timestamps=True,vad_filter=False,condition_on_previous_text=False,
  initial_prompt="Reverse Jing-Jing. Welcome to Harvard. 政治細節 中文 民生用電 兩岸關係 雙語國際競爭力",beam_size=5)
out=[]
for s in segs:
    out.append({'start':s.start,'end':s.end,'text':s.text,'words':[{'w':w.word,'s':w.start,'e':w.end,'p':w.probability} for w in s.words]})
    print(f"{s.start:7.2f} {s.end:7.2f} {s.text}",flush=True)
json.dump(out,open(sys.argv[3] if len(sys.argv)>3 else 'src/whisper_vocals.json','w'),ensure_ascii=False,indent=1)
