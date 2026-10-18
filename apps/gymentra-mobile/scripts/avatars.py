#!/usr/bin/env python3
"""Single source for the 12 predefined member avatars (decision 18 Oct 2026: profile photos are gone; people pick
one of these). Writes assets/avatars/<id>.svg (masters), src/data/avatars.generated.ts (what the app renders) and a
contact sheet PNG for review. Faceless flat symbols, one colour each on the brand's dark disc, no text, no gradients.
Rendering rule: the symbol sits in the middle ~56 px of a 100 px box so it stays legible at 34 px."""
import pathlib, subprocess, json

ROOT = pathlib.Path(__file__).resolve().parent.parent
BG, RING = '#0B0F14', '#1F2933'
S = 'stroke-linecap="round" stroke-linejoin="round" fill="none"'

AVATARS = [
 # id, Turkish name, one-line personality, colour, svg body (viewBox 0 0 100 100)
 ('rock', 'Kaya', 'Gücünü sabırla, sağlam temellerle kurar.', '#E7C69A',
  '<path d="M26 72V58h14V44h16V30h18v42z" fill="{c}" stroke="{c}" stroke-width="4" stroke-linejoin="round"/>'),
 ('strength', 'Güç', 'Direnci sever, her tekrarda ilerler.', '#FFB078',
  '<rect x="17" y="39" width="10" height="22" rx="3" fill="{c}"/><rect x="27" y="31" width="9" height="38" rx="3" fill="{c}"/>'
  '<rect x="64" y="31" width="9" height="38" rx="3" fill="{c}"/><rect x="73" y="39" width="10" height="22" rx="3" fill="{c}"/>'
  '<path d="M36 50h28" stroke="{c}" stroke-width="8" ' + S + '/>'),
 ('tempo', 'Tempo', 'Uzun mesafede istikrarını korur.', '#62DDD0',
  '<path d="M27 28l22 22-22 22M51 28l22 22-22 22" stroke="{c}" stroke-width="9" ' + S + '/>'),
 ('rhythm', 'Ritim', 'Kendi hızını bulur, düzenli devam eder.', '#7CC8FF',
  '<path d="M17 54C26 28 40 28 50 50S74 72 83 46" stroke="{c}" stroke-width="9" ' + S + '/>'),
 ('balance', 'Denge', 'Kontrolü ve uyumu birlikte geliştirir.', '#C2AEFF',
  '<path d="M20 40h60" stroke="{c}" stroke-width="9" ' + S + '/><path d="M50 46L36 74h28z" fill="{c}" stroke="{c}" stroke-width="4" stroke-linejoin="round"/>'),
 ('breath', 'Nefes', 'Sakinleşir, toparlanır, yeniden başlar.', '#E5B8ED',
  '<path d="M21 64a29 29 0 0 1 58 0M36 64a14 14 0 0 1 28 0" stroke="{c}" stroke-width="9" ' + S + '/>'),
 ('shield', 'Kalkan', 'Savunmasını sabır ve disiplinle güçlendirir.', '#B9DBEA',
  '<path d="M50 20l27 10v22c0 15-12 23-27 29-15-6-27-14-27-29V30z" fill="{c}" stroke="{c}" stroke-width="4" stroke-linejoin="round"/>'),
 ('spark', 'Atak', 'Doğru anı yakalar, kararlı hareket eder.', '#FF998C',
  '<path d="M57 19L31 55h17l-6 26 27-38H53z" fill="{c}" stroke="{c}" stroke-width="3" stroke-linejoin="round"/>'),
 ('pass', 'Pas', 'Oyunu paylaşır, başkasına alan açar.', '#F4BEA8',
  '<path d="M27 66l23-32 24 26" stroke="{c}" stroke-width="6" ' + S + '/>'
  '<circle cx="27" cy="66" r="9" fill="{c}"/><circle cx="50" cy="34" r="9" fill="{c}"/><circle cx="74" cy="60" r="9" fill="{c}"/>'),
 ('unity', 'Birlik', 'Takımın enerjisini yükseltir.', '#F3A6CB',
  '<g fill="{c}"><rect x="41" y="24" width="18" height="40" rx="5" transform="rotate(-34 50 72)"/>'
  '<rect x="41" y="24" width="18" height="40" rx="5"/><rect x="41" y="24" width="18" height="40" rx="5" transform="rotate(34 50 72)"/></g>'),
 ('summit', 'Zirve', 'Yeni yükseklikleri adım adım keşfeder.', '#B6D99A',
  '<path d="M19 74L50 24l31 50z" fill="{c}" stroke="{c}" stroke-width="4" stroke-linejoin="round"/>'),
 ('trail', 'Rota', 'Merakla ilerler, kendi yolunu bulur.', '#F1D77A',
  '<path d="M63 22C27 31 73 47 38 56 25 60 40 74 55 79" stroke="{c}" stroke-width="11" ' + S + '/>'),
]

def svg(body, color, size=100):
    inner = body.replace('{c}', color)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="{size}" height="{size}">'
            f'<circle cx="50" cy="50" r="49" fill="{BG}" stroke="{RING}" stroke-width="2"/>{inner}</svg>')

out = ROOT / 'assets' / 'avatars'
out.mkdir(parents=True, exist_ok=True)
for id_, name, _, color, body in AVATARS:
    (out / f'{id_}.svg').write_text(svg(body, color) + '\n')

ts = ["// ÜRETİLMİŞ DOSYA — elle düzenleme. Kaynak: scripts/avatars.py (python3 scripts/avatars.py).",
      "// 12 hazır üye avatarı: yüzsüz, düz, tek renk. Profil fotoğrafı yoktur (18 Ekim 2026 kararı).", "",
      "export interface AvatarDef {", "  id: string;", "  name: string;", "  personality: string;", "  color: string;",
      "  /** SVG markup, viewBox 0 0 100 100, disc + ring + symbol. */", "  xml: string;", "}", "",
      "export const AVATARS: readonly AvatarDef[] = ["]
for id_, name, pers, color, body in AVATARS:
    ts.append(f"  {{ id: {json.dumps(id_)}, name: {json.dumps(name, ensure_ascii=False)}, personality: {json.dumps(pers, ensure_ascii=False)}, color: {json.dumps(color)}, xml: {json.dumps(svg(body, color))} }},")
ts += ["];", "", "export const AVATAR_IDS: readonly string[] = AVATARS.map((a) => a.id);", ""]
(ROOT / 'src' / 'data' / 'avatars.generated.ts').write_text('\n'.join(ts))

# contact sheet for review: 12 at 96 px and again at 34 px
cells = []
for i, (id_, name, _, color, body) in enumerate(AVATARS):
    x, y = 20 + (i % 6) * 120, 20 + (i // 6) * 150
    cells.append(f'<g transform="translate({x},{y})">{svg(body, color, 96)}</g>')
    cells.append(f'<g transform="translate({x + 31},{y + 104})">{svg(body, color, 34)}</g>')
sheet = f'<svg xmlns="http://www.w3.org/2000/svg" width="760" height="340"><rect width="760" height="340" fill="#161d26"/>{"".join(cells)}</svg>'
tmp = pathlib.Path('/tmp/avatar-sheet.svg'); tmp.write_text(sheet)
subprocess.run(['rsvg-convert', '-o', str(out / 'contact-sheet.png'), str(tmp)], check=True)
print('ok', len(AVATARS))
