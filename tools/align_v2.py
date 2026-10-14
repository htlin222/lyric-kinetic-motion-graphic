"""Lyric alignment v2: Whisper (vocal stem + full mix) -> DP word matching -> snap to vocal attacks.

Inputs (src/): lyrics.txt, whisper_vocals.json, whisper_mix.json, vocal.json (onsets), audio.json (beats)
Output: src/timeline.json

Every token start is moved to the backtracked vocal onset nearest to Whisper's estimate, which is
where the syllable becomes audible. 中文 tokens get one onset per character (`chars`), so
multi-character words can be revealed syllable by syllable.
"""
import json, re, difflib, numpy as np, bisect

SRC = 'src/'
L = [l.rstrip('\n').split('|') for l in open(SRC + 'lyrics.txt', encoding='utf8') if l.strip()]
vo = json.load(open(SRC + 'vocal.json'))
ON = vo['onsets']
SY = sorted(vo['syll'])
ALL = []
for x in sorted(set(ON) | set(SY)):  # merge near-duplicate attacks (<45 ms)
    if not ALL or x - ALL[-1] > 0.045: ALL.append(x)
ENV = np.array(vo['env100'])

def words(path):
    W = []
    for s in json.load(open(path)):
        for w in s['words']:
            t = re.sub(r"[^a-z']", "", w['w'].lower())
            if t: W.append((t, w['s'], w['e']))
    return W

toks = []
for i, (sung, sub) in enumerate(L):
    for t in re.findall(r"[A-Za-z']+", sung.replace('-', ' ')):
        toks.append((i, t.lower()))

def sim(a, b): return difflib.SequenceMatcher(None, a, b).ratio()

def dp(W):
    n, m = len(toks), len(W)
    S = np.zeros((n + 1, m + 1)); B = np.zeros((n + 1, m + 1), dtype=np.int8); gap = -0.3
    S[1:, 0] = np.arange(1, n + 1) * gap; B[1:, 0] = 1
    S[0, 1:] = np.arange(1, m + 1) * gap * 0.5; B[0, 1:] = 2
    R = np.array([[sim(a[1], b[0]) for b in W] for a in toks])
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            c0 = S[i-1, j-1] + R[i-1, j-1] * 2 - 0.8; c1 = S[i-1, j] + gap; c2 = S[i, j-1] + gap * 0.5
            if c0 >= c1 and c0 >= c2: S[i, j] = c0; B[i, j] = 0
            elif c1 >= c2: S[i, j] = c1; B[i, j] = 1
            else: S[i, j] = c2; B[i, j] = 2
    i, j = n, m; match = {}
    while i > 0 and j > 0:
        k = B[i, j]
        if k == 0:
            if R[i-1, j-1] > 0.55: match[i-1] = W[j-1]
            i -= 1; j -= 1
        elif k == 1: i -= 1
        else: j -= 1
    return match

mV = dp(words(SRC + 'whisper_vocals.json'))
mM = dp(words(SRC + 'whisper_mix.json'))

# Windows for lines Whisper could not transcribe (pure 中文 / chants), from the targeted gap pass
# and the vocal-stem transcript; verified against the waveform (tools/plot_align.py).
WIN = {  # lyric index: (start, end)
    12: (43.40, 44.6), 13: (44.75, 46.5), 14: (48.55, 51.4), 16: (52.70, 54.2), 17: (54.35, 55.7),
    34: (83.0, 84.3), 35: (84.3, 85.5), 37: (87.3, 88.5),
    48: (104.65, 105.95), 49: (106.0, 107.4),
    70: (135.25, 138.3),
    97: (169.0, 170.2), 98: (170.25, 171.65),
    116: (196.30, 197.9), 117: (198.85, 200.9), 119: (204.85, 206.6),
    125: (221.45, 222.7),
}
# hand-verified per-character onsets (waveform syllable bursts)
CHARS = {70: [135.314, 135.645, 135.819, 136.046, 136.243, 136.644, 136.963]}

CJK = re.compile(r'[　-〿一-鿿＀-￯]')
HAN = re.compile(r'[一-鿿]')

def snap(t, lo=-0.16, hi=0.12):
    k = bisect.bisect_left(ON, t + lo)
    best, bd = t, 1e9
    while k < len(ON) and ON[k] <= t + hi:
        d = abs(ON[k] - t) * (0.8 if ON[k] <= t else 1.0)  # whisper tends to be a little late
        if d < bd: bd, best = d, ON[k]
        k += 1
    return best

def voiced(t): return float(ENV[min(len(ENV)-1, max(0, int(round(t * 100))))])

def onsets_in(a, b): return [x for x in ALL if a <= x < b]

lines = []
ti = 0
for i, (sung, sub) in enumerate(L):
    disp = []
    for chunk in sung.split():
        disp += re.findall(r'[　-〿一-鿿＀-￯]+|[^　-〿一-鿿＀-￯]+', chunk)
    T = []
    for d in disp:
        n = len(re.findall(r"[A-Za-z']+", d.replace('-', ' ')))
        ws = []
        for k in range(ti, ti + n):
            w = mV.get(k) or mM.get(k)
            ws.append(w)
        ti += n
        got = [w for w in ws if w]
        T.append({'t': d, 'cjk': bool(CJK.search(d)), 's': got[0][1] if got and ws[0] else (got[0][1] - 0.2 * (ws.index(got[0])) if got else None),
                  'e': got[-1][2] if got else None})
    lines.append({'i': i, 'sung': sung, 'sub': sub, 'tokens': T})

# line windows
for l in lines:
    known = [t for t in l['tokens'] if t['s'] is not None]
    if l['i'] in WIN:
        a, b = WIN[l['i']]
        if not known or abs(known[0]['s'] - a) > 0.6:  # whisper unreliable here
            for t in l['tokens']: t['s'] = t['e'] = None
        l['start'], l['end'] = a, b
    else:
        l['start'] = known[0]['s'] if known else None
        l['end'] = max(t['e'] for t in known) if known else None

# fill missing line windows from neighbours
for k, l in enumerate(lines):
    if l['start'] is None:
        prev = next(x for x in reversed(lines[:k]) if x['end'] is not None)
        nxt = next(x for x in lines[k+1:] if x['start'] is not None)
        l['start'], l['end'] = prev['end'] + 0.05, nxt['start'] - 0.05
        print('interp line', l['i'], l['sung'])

for k, l in enumerate(lines):
    prev_end = lines[k-1]['end'] if k else 0
    if l['i'] in WIN: l['lo'] = l['start']
    elif l['tokens'][0]['s'] is None: l['lo'] = max(prev_end - 0.05, l['start'] - 1.2); l['start'] = l['lo']
    else: l['lo'] = l['start']
# token times: snap known ones, distribute unknown ones over vocal onsets in the gap
for l in lines:
    T = l['tokens']
    for t in T:
        if t['s'] is not None:
            # starting in silence? move to the first voiced attack
            if voiced(t['s']) < 0.05:
                nx = [o for o in ALL if t['s'] < o < t['s'] + 0.6 and voiced(o + 0.04) > 0.08]
                if nx: t['s'] = nx[0]
            t['s'] = snap(t['s'])
    j = 0
    while j < len(T):
        if T[j]['s'] is None:
            k = j
            while k < len(T) and T[k]['s'] is None: k += 1
            lo = max(T[j-1]['s'] + 0.12, (T[j-1]['e'] or 0) - 0.08) if j > 0 else l['lo']
            hi = T[k]['s'] if k < len(T) else l['end']
            run = T[j:k]
            cand = onsets_in(lo - 0.12, hi - 0.06)
            wts = [max(1, len(x['t']) * (2 if x['cjk'] else 1)) for x in run]
            acc = 0; tot = sum(wts)
            for x, w in zip(run, wts):
                target = lo + (hi - lo) * acc / tot; acc += w
                c = [o for o in cand if (not run or o > (run[run.index(x)-1]['s'] if run.index(x) > 0 and run[run.index(x)-1]['s'] else -1) + 0.07)]
                x['s'] = min(c, key=lambda o: abs(o - target)) if c and min(abs(o - target) for o in c) < 0.35 else target
            j = k
        else: j += 1
    # monotonic
    for a, b in zip(T, T[1:]):
        if b['s'] <= a['s'] + 0.05: b['s'] = a['s'] + 0.05
    for t in T:
        if t['e'] is None or t['e'] < t['s']: t['e'] = t['s'] + 0.3
    l['start'] = min(l['start'], T[0]['s'])

# per-character onsets for 中文 tokens
for li, l in enumerate(lines):
    T = l['tokens']
    for k, t in enumerate(T):
        if not t['cjk']: continue
        n = len(HAN.findall(t['t']))
        if n == 0: continue
        if l['i'] in CHARS and len(CHARS[l['i']]) == n:
            t['chars'] = CHARS[l['i']]; t['s'] = t['chars'][0]; continue
        end = T[k+1]['s'] if k + 1 < len(T) else (lines[li+1]['tokens'][0]['s'] if li + 1 < len(lines) else t['s'] + 0.25 * n)
        end = min(end, t['s'] + 0.32 * n + 0.2)
        chars = [t['s']]
        for c in range(1, n):
            p = chars[-1]
            nx = [o for o in SY if p + 0.1 < o <= min(p + 0.45, end + 0.05)]
            if not nx: nx = [o for o in ON if p + 0.12 < o <= min(p + 0.45, end + 0.05)]
            chars.append(nx[0] if nx else p + min(0.2, max(0.1, (end - p) / (n - c + 1))))
        if chars[-1] > end - 0.03:
            # overran the next word: choose exactly n-1 attacks inside (s, end) closest to an even spread
            C = [o for o in ALL if t['s'] + 0.07 < o < end - 0.03]
            tg = [t['s'] + (end - t['s']) * c / n for c in range(1, n)]
            if len(C) >= n - 1:
                INF = 1e9; m = len(C)
                D = [[INF] * (m + 1) for _ in range(n)]; P = [[0] * (m + 1) for _ in range(n)]
                for j in range(m + 1): D[0][j] = 0
                for k in range(1, n):
                    for j in range(k, m + 1):
                        a = D[k][j-1]; b = D[k-1][j-1] + abs(C[j-1] - tg[k-1])
                        if b <= a: D[k][j] = b; P[k][j] = 1
                        else: D[k][j] = a; P[k][j] = 0
                pick = []; k, j = n - 1, m
                while k > 0:
                    if P[k][j] == 1: pick.append(C[j-1]); k -= 1
                    j -= 1
                chars = [t['s']] + sorted(pick)
            else:
                chars = [t['s']] + tg
        t['chars'] = [round(x, 3) for x in chars]

# hand-verified token starts (waveform review, tools/plot_align.py)
TOK = {116: [196.15, 196.83], 121: [215.60], 122: [217.786], 123: [219.34], 124: [220.32, 220.62], 126: [223.60]}
for l in lines:
    if l['i'] in TOK:
        for t, v in zip(l['tokens'], TOK[l['i']]): t['s'] = v; t['e'] = max(t['e'] or 0, v + 0.3)
        l['start'] = l['tokens'][0]['s']
out = []
for n, l in enumerate(lines):
    out.append({'id': n, 'sung': l['sung'], 'sub': l['sub'], 'start': round(l['start'], 3), 'end': round(max(l['end'], l['tokens'][-1]['s'] + 0.25), 3),
                'tokens': [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in t.items()} for t in l['tokens']]})
json.dump(out, open(SRC + 'timeline.json', 'w'), ensure_ascii=False, indent=1)
for x in out:
    print(f"{x['id']:3d} {x['start']:7.2f} {x['end']:7.2f} " + ' '.join(f"{t['t']}@{t['s']:.2f}" + (f"{t['chars']}" if 'chars' in t and len(t['chars']) > 1 else '') for t in x['tokens']))
