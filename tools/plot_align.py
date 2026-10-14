"""Diagnostic: vocal waveform + beats + onsets + token markers for a window.
usage: python3 tools/plot_align.py vocals.wav t0 t1 out.png [timeline.json]"""
import sys, json, numpy as np, librosa, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
fp=fm.FontProperties(fname='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc') if __import__('os').path.exists('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc') else None
wav,t0,t1,out=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),sys.argv[4]
tl=json.load(open(sys.argv[5])) if len(sys.argv)>5 else json.load(open('src/timeline.json'))
y,sr=librosa.load(wav,sr=22050,offset=t0,duration=t1-t0)
au=json.load(open('src/audio.json')); vo=json.load(open('src/vocal.json'))
fig,ax=plt.subplots(figsize=(22,4.5)); tt=t0+np.arange(len(y))/sr
ax.plot(tt,y,lw=0.3,color='#555')
env=librosa.feature.rms(y=y,hop_length=128)[0]; ax.plot(t0+np.arange(len(env))*128/sr,env*3,color='orange',lw=1)
b=np.array(au['beats']); 
for i,x in enumerate(b[(b>=t0)&(b<=t1)]): ax.axvline(x,color='blue',alpha=0.35,lw=1.2)
# 8th grid
bb=b[(b>=t0-1)&(b<=t1+1)]
for a,c in zip(bb[:-1],bb[1:]): ax.axvline((a+c)/2,color='blue',alpha=0.12,ls='--')
for x in vo['onsets']:
    if t0<=x<=t1: ax.axvline(x,ymin=0,ymax=0.15,color='green',lw=1.5)
for L in tl:
    for tk in L['tokens']:
        if t0<=tk['s']<=t1:
            ax.axvline(tk['s'],color='red',lw=1.2); ax.text(tk['s'],0.9*np.abs(y).max(),tk['t'],rotation=60,fontsize=9,color='red',fontproperties=fp)
        for c in tk.get('chars',[]):
            if t0<=c<=t1: ax.axvline(c,ymin=0.85,ymax=1,color='magenta',lw=2)
ax.set_xlim(t0,t1); ax.set_xticks(np.arange(np.ceil(t0*4)/4,t1,0.25)); ax.tick_params(axis='x',labelsize=7,rotation=90)
plt.tight_layout(); plt.savefig(out,dpi=80)
