import soundfile as sf
from faster_whisper import WhisperModel
a,_=sf.read('work/song16k.wav',dtype='float32')
m=WhisperModel('medium',device='cpu',compute_type='int8',cpu_threads=2)
for (s,e,lang,prompt) in [(41,56,None,'So very Wayne-style. 非常國際化！ REVERSE JING-JING. ALL HAIL THE KING. English on the surface, 中文救場 really clean. Reverse Jing Jing.'),
                     (82,92,'zh','um, I would say… 兩岸關係越緊張，越需要溝通與交流。Vocabulary getting dangerous? 中文直接插入。'),
                     (134,139,'zh','This is— 雙語國際競爭力！')]:
  for lg in ([lang] if lang else ['en','zh']):
    segs,_=m.transcribe(a[int(s*16000):int(e*16000)],language=lg,word_timestamps=True,initial_prompt=prompt,condition_on_previous_text=False,beam_size=5)
    print('==',s,e,lg)
    for sg in segs:
        print(' '.join(f"{w.word.strip()}@{s+w.start:.2f}-{s+w.end:.2f}" for w in sg.words))
