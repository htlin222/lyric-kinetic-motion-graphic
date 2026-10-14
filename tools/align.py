import sys
import json,re,difflib
W=[]
for s in json.load(open(sys.argv[1] if len(sys.argv)>1 else 'work/whisper_medium.json')):
    for w in s['words']:
        t=re.sub(r"[^a-z']","",w['w'].lower())
        if t: W.append((t,w['s'],w['e']))
L=[l.rstrip('\n').split('|') for l in open(sys.argv[2] if len(sys.argv)>2 else 'src/lyrics.txt',encoding='utf8')]
toks=[]  # (lineidx, tok)
for i,(sung,sub) in enumerate(L):
    for t in re.findall(r"[A-Za-z']+",sung.replace('-',' ')):
        toks.append((i,t.lower()))
n,m=len(toks),len(W)
def sim(a,b): return difflib.SequenceMatcher(None,a,b).ratio()
import numpy as np
S=np.zeros((n+1,m+1)); B=np.zeros((n+1,m+1),dtype=int)
gap=-0.3
for i in range(1,n+1): S[i,0]=i*gap; B[i,0]=1
for j in range(1,m+1): S[0,j]=j*gap*0.5; B[0,j]=2
for i in range(1,n+1):
    for j in range(1,m+1):
        r=sim(toks[i-1][1],W[j-1][0]); sc=(r*2-0.8) 
        c=[S[i-1,j-1]+sc,S[i-1,j]+gap,S[i,j-1]+gap*0.5]
        k=int(np.argmax(c)); S[i,j]=c[k]; B[i,j]=k
i,j=n,m; match={}
while i>0 and j>0:
    k=B[i,j]
    if k==0:
        if sim(toks[i-1][1],W[j-1][0])>0.55: match[i-1]=j-1
        i-=1;j-=1
    elif k==1: i-=1
    else: j-=1
lines=[{'i':i,'sung':s,'sub':b,'start':None,'end':None,'words':[]} for i,(s,b) in enumerate(L)]
for ti,(li,t) in enumerate(toks):
    if ti in match:
        w=W[match[ti]]; lines[li]['words'].append((t,w[1],w[2]))
    lines[li].setdefault('seq',[]).append([t,W[match[ti]][1],W[match[ti]][2]] if ti in match else [t,None,None])
for l in lines:
    if l['words']:
        l['start']=l['words'][0][1]; l['end']=l['words'][-1][2]
json.dump(lines,open(sys.argv[3] if len(sys.argv)>3 else 'src/aligned_raw.json','w'),ensure_ascii=False,indent=0)
for l in lines:
    ntok=len(re.findall(r"[A-Za-z']+",l['sung'].replace('-',' ')))
    print(f"{l['i']:3d} {l['start'] if l['start'] is None else round(l['start'],2)!s:>7} {l['end'] if l['end'] is None else round(l['end'],2)!s:>7} {len(l['words'])}/{ntok} {l['sung']}")
