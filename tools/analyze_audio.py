"""Beat / energy analysis -> src/audio.json  (usage: python3 tools/analyze_audio.py song.mp3)"""
import librosa, numpy as np, json, sys
y,sr=librosa.load(sys.argv[1],sr=22050,mono=True)
tempo,beats=librosa.beat.beat_track(y=y,sr=sr,units='time')
oenv=librosa.onset.onset_strength(y=y,sr=sr)
on=librosa.onset.onset_detect(onset_envelope=oenv,sr=sr,units='time')
rms=librosa.feature.rms(y=y,hop_length=512)[0]; rt=librosa.times_like(rms,sr=sr,hop_length=512)
fps=30; n=int(len(y)/sr*fps)+1
env=np.interp(np.arange(n)/fps, rt, rms); env=env/env.max()
S=np.abs(librosa.stft(y,n_fft=2048,hop_length=512)); low=S[:20].mean(0)
low=np.interp(np.arange(n)/fps, rt[:len(low)], low); low/=low.max()
json.dump({'tempo':float(np.atleast_1d(tempo)[0]),'beats':[round(float(b),3) for b in beats],'onsets':[round(float(o),3) for o in on],
  'env':[round(float(x),3) for x in env],'bass':[round(float(x),3) for x in low]},open('src/audio.json','w'))
print('tempo',tempo)
