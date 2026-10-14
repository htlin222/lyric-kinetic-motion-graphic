"""Per-frame audio-reactive data for the renderer (30 fps).
src/spectrum.bin : uint8 [frames x 64]  mel spectrum, dB-normalised, fast-attack / slow-release
src/scope.bin    : int8  [frames x 192] oscilloscope window (46 ms of the mix around each frame)
usage: python3 tools/audio_reactive.py song.mp3"""
import librosa, numpy as np, sys
FPS=30; NB=64; NS=192
y,sr=librosa.load(sys.argv[1],sr=44100,mono=True)
hop=sr//FPS
M=librosa.feature.melspectrogram(y=y,sr=sr,n_fft=4096,hop_length=hop,n_mels=NB,fmin=30,fmax=14000)
D=librosa.power_to_db(M,ref=np.max); D=np.clip((D+70)/70,0,1).T  # frames x NB
S=np.zeros_like(D); prev=np.zeros(NB)
for i,f in enumerate(D):
    prev=np.where(f>prev,f*0.7+prev*0.3,prev*0.86+f*0.14); S[i]=prev
(S*255).astype(np.uint8).tofile('src/spectrum.bin')
n=len(S); W=int(sr*0.046); sc=np.zeros((n,NS),np.int8); peak=np.abs(y).max()
for i in range(n):
    c=i*hop; seg=y[max(0,c-W//2):c+W//2]
    if len(seg)<W: seg=np.pad(seg,(0,W-len(seg)))
    sc[i]=np.clip(np.interp(np.linspace(0,W-1,NS),np.arange(W),seg)/peak*127,-127,127).astype(np.int8)
sc.tofile('src/scope.bin'); print(n,'frames')
