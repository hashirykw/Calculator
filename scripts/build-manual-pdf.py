"""Builds the printable PDF manual (manual/Nexlyr-Calculator-Manual.pdf).

Content comes from js/manual-content.js (exported to JSON first), the
screenshots and hotspot positions in /manual, and the app's own icons.
The page is laid out in HTML/CSS for A4 and printed with headless Chrome,
twice: the first pass finds which page each chapter lands on, the second
fills those numbers into the contents page.

Run from the repository root:
    node scripts/export-manual-data.mjs /tmp/mpdf/data.json
    python3 scripts/build-manual-pdf.py /tmp/mpdf/data.json
Needs: pip install playwright qrcode pdfplumber  (and a Chrome/Chromium)
"""
import asyncio, base64, html, io, json, os, re, sys
from pathlib import Path

import pdfplumber
import qrcode
import qrcode.image.svg
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/mpdf/data.json').read_text())
OUT = ROOT / 'manual' / 'Nexlyr-Calculator-Manual.pdf'
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
SITE = 'calculator.nexlyr.solutions'

E = html.escape
ICONS = DATA['ICONS']
def icon(name, cls='ic'):
    return f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS.get(name, ICONS["info"])}</svg>'
from PIL import Image
JPG = Path('/tmp/mpdf/jpg'); JPG.mkdir(parents=True, exist_ok=True)
def img(name):
    out = JPG / f'{name}.jpg'
    if not out.exists():
        im = Image.open(ROOT / 'manual' / f'{name}.webp').convert('RGB')
        if im.width > 1600: im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        im.save(out, 'JPEG', quality=84, optimize=True, progressive=True)
    return out.as_uri()
def font(name):
    return (ROOT / 'fonts' / name).as_uri()

MARK = '<svg class="mark" viewBox="0 0 66 92"><defs><linearGradient id="mk" x1="0" y1="0" x2="66" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#00C3F3"/><stop offset=".55" stop-color="#00A2DC"/><stop offset="1" stop-color="#006AB1"/></linearGradient></defs><g fill="url(#mk)"><rect x="0" width="10" height="92"/><rect x="14" width="10" height="92"/><rect x="28" width="10" height="92"/><rect x="42" width="10" height="66"/><rect x="56" width="10" height="66"/></g></svg>'

def qr_svg(url):
    q = qrcode.QRCode(border=0, box_size=10, error_correction=qrcode.constants.ERROR_CORRECT_M)
    q.add_data(url); q.make(fit=True)
    m = q.get_matrix(); n = len(m)
    rects = ''.join(f'<rect x="{x}" y="{y}" width="1.02" height="1.02"/>' for y, row in enumerate(m) for x, v in enumerate(row) if v)
    return f'<svg class="qr" viewBox="0 0 {n} {n}" shape-rendering="crispEdges"><g fill="#1E1C1A">{rects}</g></svg>'

def device(name, alt, spots=None, kind='desk'):
    marks = ''
    if spots:
        marks = '<div class="spots">' + ''.join(f'<span class="spot" style="left:{s["x"]}%;top:{s["y"]}%">{s["n"]}</span>' for s in spots) + '</div>'
    if kind == 'phone':
        return f'<div class="phone"><div class="shot"><img src="{img(name)}" alt="{E(alt)}">{marks}</div></div>'
    return f'<div class="desk"><div class="bar"><i></i><i></i><i></i><span>{SITE}</span></div><div class="shot"><img src="{img(name)}" alt="{E(alt)}">{marks}</div></div>'

def figure(f, spots=None, kind='desk'):
    cap = f'<figcaption>{E(f["caption"])}</figcaption>' if f.get('caption') else ''
    return f'<figure class="fig {kind}">{device(f["src"], f["alt"], spots, kind)}{cap}</figure>'

def legend(spots, cols=2):
    return f'<ol class="legend c{cols}">' + ''.join(f'<li><span>{s["n"]}</span>{E(s["label"])}</li>' for s in spots) + '</ol>'

def chapter(c, i):
    n = f'{i + 1:02d}'
    parts = [f'''<section class="chapter" style="--c:{c["color"]}">
      <header class="ch-head">
        <div class="ch-num">{n}</div>
        <div class="ch-badge">{icon(c["icon"])}</div>
        <div class="ch-t"><div class="kick">Chapter {n}</div><h2>{E(c["title"])}</h2><p class="lead">{E(c["lead"])}</p></div>
      </header>''']
    sp = DATA['spots']
    if c.get('tour'):
        parts.append(figure(c['img'], sp.get(c['tour'])))
        parts.append(legend(sp.get(c['tour'], []), 2))
        ph = c['phone']
        parts.append(f'<div class="tour-phone"><h3 class="h3">{icon("phone", "ic s")} On a phone</h3><div class="pair">{figure(ph, sp.get(ph.get("tour")), "phone")}{legend(sp.get(ph.get("tour"), []), 1)}</div></div>')
    elif c.get('phone'):
        parts.append(f'<div class="pair wide">{figure(c["img"])}{figure(c["phone"], None, "phone")}</div>')
    else:
        parts.append(figure(c['img']))
    if c.get('steps'):
        steps = ''.join(f'<li><span class="n">{k + 1}</span><span>{E(s)}</span></li>' for k, s in enumerate(c['steps']))
        parts.append(f'<div class="block"><h3 class="h3">{icon("list", "ic s")} Step by step</h3><ol class="steps">{steps}</ol></div>')
    if c.get('img2'):
        parts.append(figure(c['img2']))
    if c.get('keys'):
        parts.append('<div class="keys">' + ''.join(f'<div class="k"><kbd>{E(k)}</kbd><span>{E(d)}</span></div>' for k, d in c['keys']) + '</div>')
    if c.get('tips'):
        parts.append(f'<aside class="tips"><b>{icon("bulb", "ic s")} Tips</b><ul>' + ''.join(f'<li>{E(t)}</li>' for t in c['tips']) + '</ul></aside>')
    parts.append('</section>')
    return '\n'.join(parts)

def build(pages):
    ch = DATA['CHAPTERS']
    toc_rows = ''.join(
        f'<li style="--c:{c["color"]}"><span class="ti">{icon(c["icon"])}</span><span class="tn">{i + 1:02d}</span><span class="tt">{E(c["title"])}</span><span class="dots"></span><span class="pg">{pages.get(f"Chapter {i + 1:02d}", "")}</span></li>'
        for i, c in enumerate(ch))
    toc_rows += f'<li style="--c:#6E58F0"><span class="ti">{icon("keyboard")}</span><span class="tn">⌘</span><span class="tt">Keyboard shortcuts</span><span class="dots"></span><span class="pg">{pages.get("Reference", "")}</span></li>'
    toc_rows += f'<li style="--c:#E09A00"><span class="ti">{icon("help")}</span><span class="tn">?</span><span class="tt">Questions and answers</span><span class="dots"></span><span class="pg">{pages.get("Questions", "")}</span></li>'
    quick = ''.join(f'<div class="q"><span class="qn">{k + 1}</span><span class="qi">{icon(ic)}</span><b>{E(t)}</b><p>{E(d)}</p></div>' for k, (ic, t, d) in enumerate(DATA['QUICK']))
    keys = ''.join(f'<div class="k"><kbd>{E(k)}</kbd><span>{E(d)}</span></div>' for k, d in DATA['SHORTCUTS'])
    faq = ''.join(f'<div class="qa"><h4>{E(q)}</h4><p>{E(a)}</p></div>' for q, a in DATA['FAQ'])
    chapters = '\n'.join(chapter(c, i) for i, c in enumerate(ch))
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nexlyr Calculator — User Manual</title>
<style>
@font-face {{ font-family: Geist; src: url("{font('Geist-Variable.woff2')}") format("woff2"); font-weight: 100 900; }}
@font-face {{ font-family: GeistMono; src: url("{font('GeistMono-Variable.woff2')}") format("woff2"); font-weight: 100 900; }}
:root {{ --ink: #1E1C1A; --ink2: #5A554F; --ink3: #8A847C; --cream: #F1EBDA; --paper: #FBF9F4; --line: #E6E0D2; --dark: #2A2826; --accent: #00A2DC; }}
* {{ box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
html, body {{ margin: 0; font-family: Geist, sans-serif; color: var(--ink); font-size: 10pt; line-height: 1.5; }}
@page {{ size: A4; margin: 16mm 15mm 18mm; background: var(--paper);
  @bottom-left {{ content: "Nexlyr Calculator · User manual"; font: 500 7.5pt Geist; color: #8A847C; }}
  @bottom-right {{ content: counter(page) " / " counter(pages); font: 600 7.5pt GeistMono; color: #8A847C; }} }}
@page cover {{ margin: 0; background: #2A2826; @bottom-left {{ content: none; }} @bottom-right {{ content: none; }} }}
.cover, .back {{ page: cover; }}
.ic {{ width: 18px; height: 18px; flex: none; }} .ic.s {{ width: 13px; height: 13px; }}
h1, h2, h3, h4 {{ margin: 0; letter-spacing: -.01em; }}

/* cover */
.cover {{ position: relative; width: 210mm; height: 297mm; overflow: hidden; color: #F6F3EC; break-after: page;
  background: radial-gradient(55% 40% at 12% 10%, rgba(214,190,160,.55), transparent 70%), radial-gradient(45% 40% at 92% 8%, rgba(0,195,243,.28), transparent 70%),
  radial-gradient(60% 45% at 85% 92%, rgba(112,92,72,.8), transparent 70%), radial-gradient(50% 40% at 10% 95%, rgba(60,56,52,.9), transparent 70%), linear-gradient(165deg, #6E655C, #3B3733 45%, #22201E); }}
.cover .top {{ position: absolute; left: 18mm; top: 18mm; right: 18mm; display: flex; align-items: center; gap: 10px; }}
.mark {{ width: 14px; height: 20px; }}
.cover .wm {{ font-weight: 600; letter-spacing: .32em; font-size: 10pt; }} .cover .top .r {{ margin-left: auto; font: 500 8pt GeistMono; color: rgba(246,243,236,.6); }}
.cover .title {{ position: absolute; left: 18mm; top: 42mm; right: 18mm; }}
.kicker {{ display: inline-block; font: 600 8pt GeistMono; letter-spacing: .24em; text-transform: uppercase; color: var(--cream); padding: 5px 10px; border: 1px solid rgba(241,235,218,.35); border-radius: 6px; }}
.cover h1 {{ font-size: 50pt; line-height: .98; margin-top: 7mm; font-weight: 650; letter-spacing: -.035em; }}
.cover h1 span {{ color: var(--cream); display: block; }}
.cover .sub {{ margin-top: 6mm; font-size: 13pt; color: rgba(246,243,236,.78); max-width: 140mm; line-height: 1.45; }}
.cover .stage {{ position: absolute; left: 14mm; right: 14mm; top: 128mm; height: 120mm; }}
.cover .stage .desk {{ position: absolute; left: 0; top: 6mm; width: 150mm; transform: rotate(-1.2deg); }}
.cover .stage .phone {{ position: absolute; right: 2mm; top: 0; width: 52mm; transform: rotate(2.5deg); }}
.cover .chips {{ position: absolute; left: 18mm; right: 18mm; bottom: 26mm; display: flex; gap: 6px; flex-wrap: wrap; }}
.cover .chips span {{ font: 500 8.5pt Geist; padding: 5px 10px; border-radius: 7px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); }}
.cover .foot {{ position: absolute; left: 18mm; right: 18mm; bottom: 13mm; display: flex; justify-content: space-between; font: 500 8pt GeistMono; color: rgba(246,243,236,.6); }}

/* device frames */
.desk {{ border-radius: 3mm; overflow: hidden; background: #111; border: 1px solid rgba(0,0,0,.25); box-shadow: 0 6mm 14mm -6mm rgba(0,0,0,.45), 0 0 0 1.6mm rgba(30,28,26,.06); }}
.cover .desk {{ box-shadow: 0 10mm 24mm -8mm rgba(0,0,0,.7), 0 0 0 1.6mm rgba(255,255,255,.06); border-color: rgba(255,255,255,.12); }}
.bar {{ display: flex; align-items: center; gap: 5px; height: 6mm; padding: 0 3mm; background: #34312E; }}
.bar i {{ width: 2.2mm; height: 2.2mm; border-radius: 50%; background: #ff5f57; }} .bar i:nth-child(2) {{ background: #febc2e; }} .bar i:nth-child(3) {{ background: #28c840; }}
.bar span {{ margin: 0 auto; font: 500 6.5pt GeistMono; color: rgba(255,255,255,.5); padding: 1px 10px; border-radius: 4px; background: rgba(255,255,255,.06); }}
.shot {{ position: relative; line-height: 0; }} .shot img {{ width: 100%; display: block; }}
.phone {{ padding: 2.2mm; border-radius: 9mm; background: linear-gradient(145deg, #45423F, #1B1A19); box-shadow: 0 8mm 18mm -8mm rgba(0,0,0,.6), inset 0 0 0 .5mm rgba(255,255,255,.1); }}
.phone .shot {{ border-radius: 7mm; overflow: hidden; }}
.spots {{ position: absolute; inset: 0; }}
.spot {{ position: absolute; transform: translate(-50%,-50%); width: 5.2mm; height: 5.2mm; border-radius: 50%; display: grid; place-items: center; font: 700 7pt Geist; line-height: 1; color: #fff;
  background: var(--c, var(--accent)); box-shadow: 0 0 0 .7mm #fff, 0 1mm 2.5mm rgba(0,0,0,.45); }}
.phone .spot {{ width: 4.4mm; height: 4.4mm; font-size: 6pt; }}

/* contents page */
.intro {{ break-after: page; }}
.eyebrow {{ font: 600 8pt GeistMono; letter-spacing: .2em; text-transform: uppercase; color: var(--ink3); display: flex; align-items: center; gap: 8px; }}
.eyebrow::after {{ content: ""; flex: 1; height: 1px; background: var(--line); }}
.intro h2 {{ font-size: 26pt; margin: 3mm 0 2mm; letter-spacing: -.03em; }}
.intro .lead {{ color: var(--ink2); font-size: 11pt; max-width: 150mm; }}
.toc {{ list-style: none; padding: 0; margin: 5mm 0 8mm; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 4mm; }}
.toc li {{ display: flex; align-items: center; gap: 2.5mm; padding: 2mm 2.6mm; border-radius: 2.5mm; background: #fff; border: 1px solid var(--line); }}
.toc .ti {{ width: 8mm; height: 8mm; border-radius: 2.2mm; display: grid; place-items: center; color: #fff; background: var(--c); }} .toc .ti .ic {{ width: 4.2mm; height: 4.2mm; }}
.toc .tn {{ font: 600 8.5pt GeistMono; color: var(--c); width: 6mm; }}
.toc .tt {{ font-weight: 600; font-size: 9.5pt; }}
.toc .dots {{ flex: 1; border-bottom: 1px dotted #CFC7B6; transform: translateY(1mm); }}
.toc .pg {{ font: 600 9.5pt GeistMono; color: var(--ink2); min-width: 6mm; text-align: right; }}
.quick {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 4mm; }}
.q {{ position: relative; padding: 4mm; border-radius: 3mm; background: var(--dark); color: #F6F3EC; }}
.q .qn {{ position: absolute; right: 4mm; top: 3.5mm; font: 600 8pt GeistMono; color: rgba(246,243,236,.5); }}
.q .qi {{ width: 9mm; height: 9mm; border-radius: 2.5mm; display: grid; place-items: center; background: linear-gradient(140deg, #FFFBF2, #DCD1B6); color: var(--ink); margin-bottom: 3mm; }}
.q b {{ display: block; font-size: 10.5pt; }} .q p {{ margin: 1.5mm 0 0; font-size: 8.5pt; color: rgba(246,243,236,.75); line-height: 1.45; }}
.facts {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-top: 6mm; }}
.facts div {{ padding: 3.5mm; border-radius: 3mm; border: 1px solid var(--line); background: #fff; }}
.facts b {{ display: block; font-size: 20pt; letter-spacing: -.03em; line-height: 1.1; }} .facts span {{ font-size: 8.5pt; color: var(--ink2); }}

/* chapters */
.chapter {{ break-before: page; }}
.ch-head {{ position: relative; display: grid; grid-template-columns: auto 1fr; gap: 5mm; align-items: center; padding: 5mm 6mm; border-radius: 4mm; color: #fff; overflow: hidden; margin-bottom: 5mm;
  background: radial-gradient(70% 140% at 100% 0%, color-mix(in srgb, var(--c) 55%, transparent), transparent 70%), linear-gradient(135deg, #2F2C29, #1E1C1A); }}
.ch-num {{ position: absolute; right: 6mm; bottom: -6mm; font: 700 46pt Geist; letter-spacing: -.05em; color: rgba(255,255,255,.08); }}
.ch-badge {{ width: 15mm; height: 15mm; border-radius: 4mm; display: grid; place-items: center; background: linear-gradient(145deg, color-mix(in srgb, var(--c) 70%, #fff), var(--c)); box-shadow: 0 3mm 7mm -3mm var(--c); }}
.ch-badge .ic {{ width: 7.5mm; height: 7.5mm; }}
.kick {{ font: 600 7.5pt GeistMono; letter-spacing: .2em; text-transform: uppercase; color: color-mix(in srgb, var(--c) 45%, #fff); }}
.ch-head h2 {{ font-size: 21pt; margin: 1mm 0 1.5mm; font-weight: 650; }}
.ch-head .lead {{ margin: 0; font-size: 9.5pt; color: rgba(255,255,255,.78); max-width: 140mm; }}
.fig {{ margin: 0 0 4.5mm; break-inside: avoid; }}
.fig.desk .desk {{ width: 164mm; margin: 0 auto; }}
.fig.desk figcaption {{ width: 164mm; margin-left: auto; margin-right: auto; }}
.fig figcaption {{ display: flex; gap: 2mm; align-items: baseline; margin-top: 2.5mm; font-size: 8.5pt; color: var(--ink2); }}
.fig figcaption::before {{ content: ""; width: 2mm; height: 2mm; border-radius: .5mm; background: var(--c); flex: none; transform: translateY(-.3mm); }}
.pair {{ display: grid; grid-template-columns: 50mm 1fr; gap: 6mm; align-items: center; }}
.pair.wide {{ grid-template-columns: 1fr 44mm; align-items: start; }}
.fig.phone {{ margin: 0; }}
.legend {{ list-style: none; padding: 0; margin: 0 0 4mm; display: grid; gap: 1.2mm 4mm; }} .legend.c2 {{ grid-template-columns: 1fr 1fr; }}
.legend li {{ display: flex; gap: 2.5mm; align-items: flex-start; font-size: 8.5pt; color: var(--ink2); line-height: 1.35; }}
.legend li span {{ width: 4.6mm; height: 4.6mm; flex: none; border-radius: 50%; display: grid; place-items: center; font: 700 6.5pt Geist; color: #fff; background: var(--c); }}
.tour-phone {{ break-before: page; }}
.h3 {{ display: flex; align-items: center; gap: 2mm; font: 600 7.5pt GeistMono; letter-spacing: .18em; text-transform: uppercase; color: var(--ink3); margin: 0 0 2.5mm; }}
.block {{ margin-bottom: 4.5mm; }}
.steps {{ list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; }}
.steps li {{ display: flex; gap: 2.5mm; align-items: flex-start; padding: 2mm 2.6mm; border-radius: 2.5mm; background: #fff; border: 1px solid var(--line); font-size: 8.6pt; line-height: 1.42; break-inside: avoid; }}
.steps .n {{ width: 5.5mm; height: 5.5mm; flex: none; border-radius: 1.6mm; display: grid; place-items: center; font: 700 8pt GeistMono; color: #fff; background: var(--c); }}
.tips {{ break-inside: avoid; padding: 3mm 4mm; border-radius: 3mm; background: #FFF6E2; border: 1px dashed #E9C77E; }}
.tips b {{ display: flex; align-items: center; gap: 2mm; color: #9A6A00; font-size: 9pt; margin-bottom: 1mm; }}
.tips ul {{ margin: 0; padding-left: 4.5mm; color: var(--ink2); font-size: 8.8pt; display: grid; gap: .8mm; }}
.keys {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1.6mm 4mm; margin-bottom: 5mm; break-inside: avoid; }}
.k {{ display: flex; gap: 3mm; align-items: center; padding: 1.8mm 2.5mm; border-radius: 2mm; background: #fff; border: 1px solid var(--line); font-size: 8.8pt; color: var(--ink2); }}
kbd {{ font: 600 8pt GeistMono; padding: .8mm 2mm; border-radius: 1.4mm; color: var(--ink); background: #F3EFE5; border: 1px solid #D9D1C0; border-bottom-width: 2px; white-space: nowrap; }}

/* reference pages */
.ref {{ break-before: page; }}
.qa {{ padding: 3.5mm 4mm; border-radius: 3mm; background: #fff; border: 1px solid var(--line); margin-bottom: 2.5mm; break-inside: avoid; }}
.qa h4 {{ font-size: 10.5pt; margin-bottom: 1mm; }} .qa p {{ margin: 0; color: var(--ink2); font-size: 9pt; }}

/* back cover */
.back {{ break-before: page; position: relative; width: 210mm; height: 297mm; color: #F6F3EC; overflow: hidden;
  background: radial-gradient(55% 40% at 85% 12%, rgba(214,190,160,.45), transparent 70%), radial-gradient(50% 45% at 10% 88%, rgba(0,162,220,.22), transparent 70%), linear-gradient(165deg, #4A4540, #22201E); }}
.back .inner {{ position: absolute; left: 20mm; right: 20mm; top: 60mm; }}
.back h2 {{ font-size: 32pt; letter-spacing: -.03em; line-height: 1.05; }} .back h2 span {{ color: var(--cream); }}
.back p {{ color: rgba(246,243,236,.75); font-size: 11.5pt; max-width: 130mm; }}
.back .qrbox {{ display: flex; gap: 7mm; align-items: center; margin-top: 12mm; padding: 6mm; border-radius: 4mm; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); width: max-content; }}
.qr {{ width: 34mm; height: 34mm; padding: 3mm; background: #F6F3EC; border-radius: 3mm; }}
.back .qrbox b {{ display: block; font-size: 13pt; }} .back .qrbox span {{ font: 500 9pt GeistMono; color: rgba(246,243,236,.7); }}
.back .contact {{ position: absolute; left: 20mm; right: 20mm; bottom: 22mm; display: flex; justify-content: space-between; align-items: flex-end; font: 500 9pt GeistMono; color: rgba(246,243,236,.7); }}
.back .contact .brand {{ display: flex; align-items: center; gap: 10px; color: #F6F3EC; font: 600 10pt Geist; letter-spacing: .3em; }}
</style></head><body>

<section class="cover">
  <div class="top">{MARK}<span class="wm">NEXLYR</span><span class="r">{SITE}</span></div>
  <div class="title"><span class="kicker">User manual</span><h1>Nexlyr<span>Calculator</span></h1>
    <p class="sub">The illustrated guide to every screen, tool and feature: the calculator, step-by-step solving, graphs, 24 tools, Earth &amp; Geo, Amy, the arcade, themes and installing the app.</p></div>
  <div class="stage">{device('overview', 'Nexlyr Calculator on a computer')}{device('phone', 'Nexlyr Calculator on a phone', None, 'phone')}</div>
  <div class="chips"><span>Scientific calculator</span><span>Solve with steps</span><span>2D &amp; 3D graphs</span><span>24 tools</span><span>Earth &amp; Geo</span><span>Amy tutor</span><span>20 games</span><span>Works offline</span></div>
  <div class="foot"><span>Version 1.0 · November 2026</span><span>A Nexlyr Solutions product</span></div>
</section>

<section class="intro">
  <div class="eyebrow">Welcome</div>
  <h2>Everything in one place</h2>
  <p class="lead">Nexlyr Calculator is free, needs no sign-up, installs like an app and keeps working offline. This manual walks through each part with real screenshots.</p>
  <div class="facts"><div><b>24</b><span>tools</span></div><div><b>20</b><span>maths games</span></div><div><b>22</b><span>themes</span></div><div><b>5</b><span>sound packs</span></div></div>
  <div class="eyebrow" style="margin-top:9mm">Contents</div>
  <ol class="toc">{toc_rows}</ol>
  <div class="eyebrow">Start in three steps</div>
  <div class="quick">{quick}</div>
</section>

{chapters}

<section class="ref" style="--c:#6E58F0">
  <header class="ch-head"><div class="ch-num">⌘</div><div class="ch-badge">{icon('keyboard')}</div><div class="ch-t"><div class="kick">Reference</div><h2>Keyboard shortcuts</h2><p class="lead">Work faster on a computer.</p></div></header>
  <div class="keys">{keys}</div>
</section>

<section class="ref" style="--c:#E09A00">
  <header class="ch-head"><div class="ch-num">?</div><div class="ch-badge">{icon('help')}</div><div class="ch-t"><div class="kick">Questions</div><h2>Questions and answers</h2><p class="lead">Quick answers to common questions.</p></div></header>
  {faq}
</section>

<section class="back">
  <div class="inner"><span class="kicker">Open it now</span>
    <h2 style="margin-top:6mm">Your calculator,<br><span>anywhere.</span></h2>
    <p>Scan to open Nexlyr Calculator, then tap Download app to keep it on your phone or computer.</p>
    <div class="qrbox">{qr_svg('https://' + SITE + '/?source=manual')}<div><b>{SITE}</b><span>Free · works offline · no sign-up</span></div></div></div>
  <div class="contact"><span class="brand">{MARK}NEXLYR</span><span>nexlyr.solutions · nexlyr.solutions@gmail.com</span></div>
</section>
</body></html>'''

async def render(doc, path):
    tmp = Path('/tmp/mpdf/manual.html'); tmp.write_text(doc)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await b.new_page()
        await pg.goto(tmp.as_uri()); await pg.wait_for_load_state('networkidle'); await pg.wait_for_timeout(800)
        await pg.pdf(path=str(path), format='A4', print_background=True, prefer_css_page_size=True)
        await b.close()

def find_pages(path):
    found = {}
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = (page.extract_text() or '')
            for m in re.finditer(r'CHAPTER (\d\d)', text.upper()):
                found.setdefault(f'Chapter {m.group(1)}', i)
            if 'KEYBOARD SHORTCUTS' in text.upper() and 'REFERENCE' in text.upper(): found.setdefault('Reference', i)
            if 'QUESTIONS AND ANSWERS' in text.upper() and i > 3: found.setdefault('Questions', i)
    return found

async def main():
    OUT.parent.mkdir(exist_ok=True)
    first = Path('/tmp/mpdf/pass1.pdf')
    await render(build({}), first)
    pages = find_pages(first)
    print('chapter pages:', pages)
    await render(build(pages), OUT)
    print('wrote', OUT, OUT.stat().st_size // 1024, 'KB')

asyncio.run(main())
