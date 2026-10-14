"""Merge DP-aligned whisper words + manual gap fixes (from targeted whisper pass) into src/timeline.json"""
import json,re,sys
lines=json.load(open(sys.argv[1]))
# (start,end) fixes from targeted whisper pass on gap windows
FIX={11:(40.94,43.4),12:(43.44,44.5),13:(44.82,46.4),14:(48.64,51.36),15:(51.54,52.58),16:(52.78,54.16),17:(54.42,55.68),
     18:(55.75,57.26),26:(71.52,72.9),33:(82.2,83.0),34:(83.08,84.26),35:(84.32,85.48),36:(85.68,87.18),37:(87.4,88.5),38:(88.56,89.9),39:(90.08,91.7),
     61:(125.3,126.5),63:(127.98,129.3),69:(135.48,138.3),84:(150.72,151.6),86:(153.68,154.7),121:(220.16,221.4),122:(221.52,222.7),123:(223.38,226.0)}
CJK=re.compile(r'[　-〿一-鿿＀-￯]')
out=[]
for l in lines:
    i=l['i']; st,en=FIX.get(i,(l['start'],l['end']))
    seq=l.get('seq',[])
    # display tokens
    disp=[]
    for chunk in l['sung'].split():
        for part in re.findall(r'[　-〿一-鿿＀-￯]+|[^　-〿一-鿿＀-￯]+',chunk):
            disp.append(part)
    k=0; toks=[]
    for d in disp:
        n=len(re.findall(r"[A-Za-z']+",d.replace('-',' ')))
        ws=seq[k:k+n]; k+=n
        ts=[w[1] for w in ws if w[1] is not None]; te=[w[2] for w in ws if w[2] is not None]
        toks.append({'t':d,'cjk':bool(CJK.search(d)),'s':min(ts) if ts and i not in FIX else None,'e':max(te) if te and i not in FIX else None})
    # fill missing token times by interpolation within line (weighted by length)
    known=[(j,t['s']) for j,t in enumerate(toks) if t['s'] is not None]
    wts=[max(1,len(t['t'])*(2 if t['cjk'] else 1)) for t in toks]
    tot=sum(wts); acc=0
    for j,t in enumerate(toks):
        if t['s'] is None:
            prev=[(a,b) for a,b in known if a<j]; nxt=[(a,b) for a,b in known if a>j]
            lo=toks[prev[-1][0]]['e'] if prev else st
            hi=nxt[0][1] if nxt else en
            # spread unknown run between lo..hi
            run=[x for x in range((prev[-1][0]+1) if prev else 0,(nxt[0][0]) if nxt else len(toks))]
            rw=sum(wts[x] for x in run); off=sum(wts[x] for x in run if x<j)
            t['s']=lo+(hi-lo)*off/rw; t['e']=lo+(hi-lo)*(off+wts[j])/rw
    out.append({'i':i,'sung':l['sung'],'sub':l['sub'],'start':round(st,3),'end':round(en,3),'tokens':[{**t,'s':round(t['s'],3),'e':round(t['e'],3)} for t in toks]})
# split the double chant at 196-201
o=[x for x in out if x['i']==114][0]
a=dict(o,start=196.3,end=197.58,tokens=[dict(t) for t in o['tokens']]); b=dict(o,start=199.86,end=201.26,tokens=[dict(t) for t in o['tokens']])
for x,(s0) in ((a,196.3),(b,199.86)):
    for j,t in enumerate(x['tokens']): t['s']=round(s0+j*0.42,3); t['e']=round(t['s']+0.4,3)
idx=out.index(o); out[idx:idx+1]=[a,b]
for n,x in enumerate(out): x['id']=n
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
for x in out: print(f"{x['id']:3d} {x['start']:7.2f} {x['end']:7.2f} "+' '.join(f"{t['t']}@{t['s']:.2f}" for t in x['tokens']))
