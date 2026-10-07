"""
Yandan uzuv siluetlerini MakeHuman (MPFB) modelinden çıkarır.

    blender --background --python scripts/blender/extract-parts.py -- <çıktı.json>

Gereken: Blender 4.2+ ve MPFB eklentisi (`blender --online-mode -c extension
install mpfb --enable`). Temel insan modeli CC0 (MPFB `data/3dobjs/base.obj`
başlığı: "explicitly released as CC0 in september 2020"). MPFB'nin kodu GPL;
burada yalnızca ürettiği geometri kullanılıyor, kodu dağıtılmıyor.

Ne yapıyor:
  1. Erkek, atletik bir insan kuruyor ve `game_engine` iskeletini oturtuyor.
  2. Her köşeyi en çok etkilendiği kemiğe atıyor.
  3. Her uzvu KENDİ kemik ekseninde yandan izdüşürüyor: eksen = kemik yönü,
     ön = vücudun ileri yönünün kemiğe dik bileşeni. Kolun A-pozda yana açık
     olması bu yüzden izdüşümü bozmuyor.
  4. Üçgenleri bir ızgaraya çiziyor, en büyük parçanın dış hattını izliyor.

Çıktı: parça başına kemik uzunluğu (model birimi) ve dış hat noktaları
(u = kemik boyunca, v = anatomik öne doğru; ikisi de model biriminde).
Eğriye çevirme ve rig ölçeğine taşıma `scripts/import-makehuman.mjs`'te.
"""

import json
import sys

import bpy
import numpy as np
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1]

from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

MACRO = {
    "gender": 1.0,       # erkek
    "age": 0.5,          # ~25 yaş
    "muscle": 0.7,       # atletik — bir salon uygulamasının figürü
    "weight": 0.5,
    "proportions": 1.0,  # ideal oranlar
    "height": 0.5,
    "cupsize": 0.5,
    "firmness": 0.5,
    "race": {"asian": 0.33, "caucasian": 0.34, "african": 0.33},
}

basemesh = HumanService.create_human(mask_helpers=True, macro_detail_dict=MACRO)
rig = HumanService.add_builtin_rig(basemesh, "game_engine")

# Hedefler ve maske uygulanmış hali: değerlendirilmiş mesh.
dg = bpy.context.evaluated_depsgraph_get()
ev = basemesh.evaluated_get(dg)
mesh = ev.to_mesh()
verts = np.array([v.co[:] for v in mesh.vertices])
mw = np.array(basemesh.matrix_world)
verts = (np.c_[verts, np.ones(len(verts))] @ mw.T)[:, :3]

# Her köşenin baskın kemiği.
groups = {g.index: g.name for g in basemesh.vertex_groups}
dominant = []
for v in mesh.vertices:
    best, bw = None, 0.0
    for g in v.groups:
        name = groups.get(g.group, "")
        if g.weight > bw and name in rig.data.bones:
            best, bw = name, g.weight
    dominant.append(best)
dominant = np.array(dominant, dtype=object)

faces = [tuple(p.vertices) for p in mesh.polygons]

bones = {b.name: (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local) for b in rig.data.bones}

# Vücudun ileri yönü: ayak kemiği topuktan parmağa öne uzanıyor. Tahmin değil
# ölçüm — MakeHuman'ın hangi eksene baktığını varsaymıyoruz.
fa, fb = bones["foot_l"]
FORWARD = Vector((fb.x - fa.x, fb.y - fa.y, 0)).normalized()


def frame(a, b):
    """Kemik başı a, sonu b. Döner: (eksen birim vektörü, ön birim vektörü, uzunluk)."""
    axis = (b - a).normalized()
    fwd = FORWARD - axis * FORWARD.dot(axis)
    return axis, fwd.normalized(), (b - a).length


def outline(vsel, a, axis, fwd, res):
    """Seçili köşelerin üçgenlerini (u, v) düzlemine çizip dış hattı döner."""
    sel = set(vsel.tolist())
    tris = []
    for f in faces:
        if all(i in sel for i in f):
            # Dörtgenleri iki üçgene böl.
            tris.append((f[0], f[1], f[2]))
            if len(f) == 4:
                tris.append((f[0], f[2], f[3]))
    P = verts - np.array(a[:])
    u = P @ np.array(axis[:])
    v = P @ np.array(fwd[:])
    idx = np.array(sorted(sel))
    umin, umax = u[idx].min() - 2 * res, u[idx].max() + 2 * res
    vmin, vmax = v[idx].min() - 2 * res, v[idx].max() + 2 * res
    W = int((vmax - vmin) / res) + 3
    H = int((umax - umin) / res) + 3
    grid = np.zeros((H, W), dtype=bool)
    gx = (v - vmin) / res
    gy = (u - umin) / res
    for t in tris:
        xs, ys = gx[list(t)], gy[list(t)]
        x0, x1 = int(np.floor(xs.min())), int(np.ceil(xs.max()))
        y0, y1 = int(np.floor(ys.min())), int(np.ceil(ys.max()))
        X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, bx, cx), (ay, by, cy) = xs, ys
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            continue
        l1 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / d
        l2 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / d
        inside = (l1 >= -1e-6) & (l2 >= -1e-6) & (1 - l1 - l2 >= -1e-6)
        grid[y0:y1 + 1, x0:x1 + 1] |= inside
    return grid, (umin, vmin, res)


def trace(grid):
    """En büyük bileşenin dış sınırı (Moore komşuluğu), ızgara koordinatında."""
    from collections import deque
    H, W = grid.shape
    lab = np.zeros_like(grid, dtype=np.int32)
    best, best_n, cur = 0, 0, 0
    for y in range(H):
        for x in range(W):
            if grid[y, x] and not lab[y, x]:
                cur += 1
                q = deque([(y, x)])
                lab[y, x] = cur
                n = 0
                while q:
                    cy, cx = q.popleft()
                    n += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and grid[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = cur
                            q.append((ny, nx))
                if n > best_n:
                    best, best_n = cur, n
    m = lab == best
    # İç boşlukları doldur: dışarıdan erişilemeyen boş hücreler içeride.
    out = np.zeros_like(m)
    q = deque([(0, 0)])
    out[0, 0] = True
    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < H and 0 <= nx < W and not m[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True
                q.append((ny, nx))
    m = ~out
    start = None
    for y in range(H):
        for x in range(W):
            if m[y, x]:
                start = (y, x)
                break
        if start:
            break
    nb = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
    pts = [start]
    cur, back = start, 6
    for _ in range(H * W * 4):
        found = False
        for k in range(8):
            d = (back + 1 + k) % 8
            ny, nx = cur[0] + nb[d][0], cur[1] + nb[d][1]
            if 0 <= ny < H and 0 <= nx < W and m[ny, nx]:
                back = (d + 4) % 8
                cur = (ny, nx)
                found = True
                break
        if not found or cur == start:
            break
        pts.append(cur)
    return pts


RES = 0.004  # model birimi (scale 0.1 → ~metre); ~4 mm

# Uzuvlar: (bizim parça adı, kemik)
LIMBS = [("thigh", "thigh_l"), ("shin", "calf_l"), ("upper", "upperarm_l"), ("fore", "lowerarm_l")]
result = {"forward": list(FORWARD[:]), "parts": {}}

for name, bone in LIMBS:
    a, b = bones[bone]
    axis, fwd, L = frame(a, b)
    vsel = np.where(dominant == bone)[0]
    grid, (umin, vmin, res) = outline(vsel, a, axis, fwd, RES)
    pts = trace(grid)
    poly = [[float(umin + (y + 0.5) * res), float(vmin + (x + 0.5) * res)] for y, x in pts]
    result["parts"][name] = {"len": L, "outline": poly}

# Gövde: pelvis + omurga + boyun köşeleri, DİK eksende. Bantlara bölme ve
# eklem yükseklikleri Node tarafında; burada eklem noktaları da veriliyor.
TRUNK = ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01"]
vsel = np.where(np.isin(dominant, TRUNK))[0]
hipL = bones["thigh_l"][0]
shoulder = bones["upperarm_l"][0]
neck_top = bones["head"][0]
up = Vector((0, 0, 1))
origin = Vector((0, 0, hipL.z))
fwd = FORWARD
grid, (umin, vmin, res) = outline(vsel, origin, up, fwd, RES)
pts = trace(grid)
poly = [[float(umin + (y + 0.5) * res), float(vmin + (x + 0.5) * res)] for y, x in pts]
# Eklem yükseklikleri kalça merkezinden yukarı; ön-arka ekseni kalça merkezine göre.
hipC = (bones["thigh_l"][0] + bones["thigh_r"][0]) / 2
result["trunk"] = {
    "outline": poly,
    "hip": [0.0, float((hipC - origin).dot(fwd))],
    "waist": [float(bones["spine_02"][0].z - hipL.z), float((bones["spine_02"][0] - origin).dot(fwd))],
    "shoulder": [float(shoulder.z - hipL.z), float((shoulder - origin).dot(fwd))],
    "neck": [float(neck_top.z - hipL.z), float((neck_top - origin).dot(fwd))],
}
result["legLength"] = (bones["thigh_l"][1] - bones["thigh_l"][0]).length + (bones["calf_l"][1] - bones["calf_l"][0]).length

with open(OUT, "w") as fh:
    json.dump(result, fh)
print("OK", OUT, {k: round(v["len"], 4) for k, v in result["parts"].items()})
