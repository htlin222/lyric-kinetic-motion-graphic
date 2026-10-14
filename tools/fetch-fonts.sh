#!/usr/bin/env bash
# Downloads the OFL fonts used by the renderer into ./fonts
set -euo pipefail
cd "$(dirname "$0")/../fonts"
GF=https://raw.githubusercontent.com/google/fonts/main/ofl
NC=https://raw.githubusercontent.com/notofonts/noto-cjk/main
get(){ [ -f "$2" ] || { echo "↓ $2"; curl -fsSL "$1" -o "$2"; }; }
get "$GF/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf" PlayfairDisplay.ttf
get "$GF/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf" PlayfairDisplay-Italic.ttf
get "$GF/anton/Anton-Regular.ttf" Anton-Regular.ttf
get "$GF/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf" Cormorant.ttf
get "$GF/cormorantgaramond/CormorantGaramond-Italic%5Bwght%5D.ttf" Cormorant-Italic.ttf
get "$NC/Serif/OTF/TraditionalChinese/NotoSerifCJKtc-Black.otf" NotoSerifCJKtc-Black.otf
get "$NC/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Black.otf" NotoSansCJKtc-Black.otf
echo "fonts ready"
