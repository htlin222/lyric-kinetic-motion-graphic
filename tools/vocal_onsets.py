"""Vocal-stem onset analysis -> src/vocal.json
usage: python3 tools/vocal_onsets.py vocals.wav
Onsets are backtracked to the start of each energy rise (the audible attack of a syllable)."""
import librosa, numpy as np, json, sys
y,sr=librosa.load(sys.argv[1],sr=22050,mono=True)
hop=128
o=librosa.onset.onset_strength(y=y,sr=sr,hop_length=hop,aggregate=np.median,fmax=6000)
on=librosa.onset.onset_detect(onset_envelope=o,sr=sr,hop_length=hop,backtrack=True,units='time',delta=0.04,wait=4)
rms=librosa.feature.rms(y=y,hop_length=hop)[0]; rms=rms/rms.max()
t=librosa.times_like(rms,sr=sr,hop_length=hop)
# keep only onsets where the voice is actually present shortly after
keep=[float(x) for x in on if rms[(t>=x)&(t<x+0.08)].max(initial=0)>0.06]
env=np.interp(np.arange(0,len(y)/sr,0.01),t,rms)
# syllable nuclei boundaries: valleys of the smoothed vocal envelope followed by a clear rise
from scipy.ndimage import uniform_filter1d
from scipy.signal import argrelmin
es=uniform_filter1d(env,5)
syll=[]
for k in argrelmin(es,order=4)[0]:
    nxt=es[k:k+18].max() if k+18<len(es) else 0
    if nxt>0.08 and nxt>es[k]*1.35+0.02:
        # attack = first point after the valley where the envelope has risen 30% of the way to the peak
        pk=k+int(np.argmax(es[k:k+18])); thr=es[k]+0.3*(es[pk]-es[k])
        a=k+int(np.argmax(es[k:pk+1]>=thr)); syll.append(round(a*0.01,3))
json.dump({'onsets':[round(x,3) for x in keep],'syll':syll,'env100':[round(float(v),3) for v in env]},open('src/vocal.json','w'))
print(len(on),'onsets ->',len(keep),'voiced')
