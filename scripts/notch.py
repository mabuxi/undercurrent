#!/usr/bin/env python3
# Makes web/src/theme-cutout.css from web/src/theme-cutout.src.css: python3 scripts/notch.py web/src/theme-cutout.src.css web/src/theme-cutout.css
# Masks for the Cutout look: a panel with a round cut-out at its top right corner (where its button sits), with soft
# fillets where the cut-out meets the edges. Returns the full mask value (three layers).
import urllib.parse
def f(x): return ('%.2f'%x).rstrip('0').rstrip('.')
def notch(NW, NH, r, fl):
    TW, TH = NW+fl, NH+fl
    x0 = TW-NW
    d=(f"M0 0H{f(x0-fl)}A{f(fl)} {f(fl)} 0 0 1 {f(x0)} {f(fl)}V{f(NH-r)}A{f(r)} {f(r)} 0 0 0 {f(x0+r)} {f(NH)}"
       f"H{f(TW-fl)}A{f(fl)} {f(fl)} 0 0 1 {f(TW)} {f(NH+fl)}V{f(TH)}H0Z")
    svg=f"<svg xmlns='http://www.w3.org/2000/svg' width='{TW}' height='{TH}' viewBox='0 0 {TW} {TH}'><path d='{d}'/></svg>"
    uri="data:image/svg+xml,"+urllib.parse.quote(svg, safe="/:=' ")
    return (f"url(\"{uri}\") right top/{TW}px {TH}px no-repeat,linear-gradient(#000 0 0) left top/calc(100% - {TW-1}px) 100% no-repeat,"
            f"linear-gradient(#000 0 0) left bottom/100% calc(100% - {TH-1}px) no-repeat")
SIZES={'SM':(46,46,23,11),'MD':(82,46,23,11),'LG':(62,62,31,13)}
import sys
src=open(sys.argv[1]).read()
for k,v in SIZES.items(): src=src.replace('{NOTCH_%s}'%k, notch(*v))
open(sys.argv[2],'w').write(src)
