/**
 * Kukla editörünün arayüzü.
 *
 * Motor buraya `/engine/` altından geliyor: uygulamanın çalıştırdığı
 * `src/utils/rig.ts` ve `rigEdit.ts` dosyalarının derlenmiş hâli. Bu dosyada
 * hiçbir kinematik hesap YOK — çizim, sürükleme olayları ve düzenleme
 * durumundan ibaret. Motorun ikinci bir kopyasını buraya yazmak, uygulamada
 * bozuk olan bir şeyin editörde düzgün görünmesine yol açardı.
 */

import {
  BAR_Y, D, FX, GROUND, add, boundsFor, capsule, fillPose, footDirFor, footPath,
  frontPoints, frontTrunk, lerpP, poseAt, skeleton,
} from '/engine/rig.js';
import { applyPatch, dragHandles, dragJoint } from '/engine/rigEdit.js';
import { auditExercise, auditFrame, auditLoop } from '/engine/rigAudit.js';

const NS = 'http://www.w3.org/2000/svg';
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const el = (n, a, kids) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]);
  (kids || []).forEach((c) => e.appendChild(c));
  return e;
};
const $ = (id) => document.getElementById(id);

const ANGLES = [
  ['shinA', 'Baldır', 0, 360], ['thighA', 'Uyluk', 0, 360],
  ['torso', 'Bel', 0, 360], ['thoraxA', 'Göğüs', 0, 360], ['neckA', 'Boyun', 0, 360],
  ['upperA', 'Üst kol', 0, 360], ['foreA', 'Ön kol', 0, 360],
  ['thighF', 'Uzak uyluk', 0, 360], ['shinF', 'Uzak baldır', 0, 360],
  ['upperF', 'Uzak üst kol', 0, 360], ['foreF', 'Uzak ön kol', 0, 360],
  ['hx', 'El yatay', -200, 200], ['hy', 'El dikey', -220, 220],
  ['hxF', 'Önden el açıklığı', 0, 200], ['shLift', 'Omuz yükselmesi', 0, 40],
  ['ankleLift', 'Topuk/basamak', 0, 120],
];

const OPTIONS = {
  mode: [['stand', 'Ayakta'], ['quad', 'Dört ayak'], ['bench', 'Sehpa'], ['supine', 'Sırtüstü'], ['hang', 'Barda asılı']],
  arm: [['angles', 'Açıyla'], ['ik', 'Hedefe (ters kinematik)'], ['floor', 'Yerde']],
  bar: [['', 'Yok'], ['back', 'Sırtta'], ['hands', 'Elde'], ['hips', 'Kalçada']],
  load: [['', 'Yok'], ['barbell', 'Barbell'], ['dumbbell', 'Dambıl']],
  prop: [['', 'Yok'], ['bench', 'Sehpa'], ['box', 'Basamak'], ['bar', 'Barfiks barı'], ['hipbench', 'Omuz sehpası']],
  view: [['side', 'Yandan'], ['front', 'Önden']],
  bend: [['1', 'İleri (+1)'], ['-1', 'Geri (−1)']],
};

let DATA = {};
let NAMES = {};
let key = null;
let kfIndex = 0;
let plane = 'side';
let playing = false;
let playT = 0;
/** Çubuk bir karenin üstünde değilse ara kareye bakılıyor demektir. */
let scrubT = null;
let dragging = null;
let dirty = false;
let onion = true;
let filter = '';
// Geri alma yığını: sürükleme yıkıcı ve anında; kaçan bir hamlenin
// dönüşü olmazsa araç kullanılamaz.
const undoStack = [];
const redoStack = [];

const ex = () => DATA[key];
const frame = () => ex().kf[kfIndex];
/** Sürükleme yalnızca kare üstünde; ara karede poz kimseye ait değil. */
const editable = () => !playing && scrubT === null;
const currentT = () => (playing ? playT : scrubT !== null ? scrubT : frame().t);
const currentPose = () => (editable() ? fillPose(frame().p) : poseAt(ex(), currentT()).p);

/**
 * Zaman çubuğunu bir ana götürür.
 *
 * Bir karenin üstüne denk gelirse o kareye KİLİTLENİR: düzenleme yalnızca
 * kare üstünde açık, ve uyarıya tıklayıp kareye gelen biri "ara kare, salt
 * okunur" duvarına toslamamalı.
 */
const goToTime = (t) => {
  playing = false;
  $('play').textContent = 'Oynat';
  const near = ex().kf.findIndex((k) => Math.abs(k.t - t) < 0.02);
  if (near >= 0) { kfIndex = near; scrubT = null; } else { scrubT = t; }
};

const snapshot = () => {
  undoStack.push(JSON.stringify(DATA));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
};

const restore = (json) => {
  DATA = JSON.parse(json);
  if (!DATA[key]) key = Object.keys(DATA)[0];
  kfIndex = Math.min(kfIndex, ex().kf.length - 1);
  renderAll();
};

// --- çizim ---------------------------------------------------------------

function draw() {
  const svg = $('stage');
  const e = ex();
  const p = currentPose();
  const S = skeleton(e, p);
  const S0 = skeleton(e, poseAt(e, 0).p);
  const view = plane;
  svg.setAttribute('viewBox', boundsFor(e, view));
  svg.innerHTML = '';

  const skin = css('--skin'), skinFar = css('--skinFar'), joint = css('--joint');
  const line = css('--line'), metal = css('--metal'), floor = css('--floor'), surf2 = css('--surf2'), accent = css('--p');
  const push = (arr) => arr.forEach((n) => svg.appendChild(n));
  const seg = (a, b, wa, wb, far) => el('path', { d: capsule(a, b, wa, wb), fill: far ? skinFar : skin, stroke: line });
  const ball = (c, r, far) => el('circle', { cx: c[0], cy: c[1], r, fill: far ? skinFar : joint, stroke: line });
  const limb = (a, b, wa, wm, wb, at, far) => { const m = lerpP(a, b, at); return [seg(a, m, wa, wm, far), seg(m, b, wm, wb, far)]; };
  const db = (c, from, far) => {
    const deg = (Math.atan2(c[1] - from[1], c[0] - from[0]) * 180) / Math.PI + 90;
    const fill = far ? skinFar : metal;
    return [el('g', { transform: `rotate(${deg} ${c[0]} ${c[1]})` }, [
      el('rect', { x: c[0] - 17, y: c[1] - 4, width: 34, height: 8, rx: 4, fill, stroke: line }),
      el('rect', { x: c[0] - 25, y: c[1] - 13, width: 13, height: 26, rx: 4, fill, stroke: accent }),
      el('rect', { x: c[0] + 12, y: c[1] - 13, width: 13, height: 26, rx: 4, fill, stroke: accent }),
    ])];
  };
  const plate = (c) => (c ? [
    el('circle', { cx: c[0], cy: c[1], r: 50, fill: metal, stroke: accent, 'stroke-width': 2 }),
    el('circle', { cx: c[0], cy: c[1], r: 38, fill: 'none', stroke: line }),
    el('circle', { cx: c[0], cy: c[1], r: 11, fill: joint, stroke: accent, 'stroke-width': 2 }),
  ] : []);

  // Gölge: bir önceki ve bir sonraki karenin izi. Çömelmenin dibini yazarken
  // tepesini görmek, iki kareyi ilişkilendirmenin tek yolu.
  if (onion && editable()) {
    const ghost = css('--ghost');
    [kfIndex - 1, kfIndex + 1].forEach((i) => {
      const k = e.kf[i];
      if (!k) return;
      const gp = fillPose(k.p);
      const gs = skeleton(e, gp);
      const bones = [
        [gs.pelvis, gs.knee], [gs.knee, gs.ankle], [gs.pelvis, gs.lumbar], [gs.lumbar, gs.thorax],
        [gs.thorax, gs.neck], [gs.sh, gs.elbow], [gs.elbow, gs.hand], [gs.hipF, gs.kneeF], [gs.kneeF, gs.ankleF],
      ];
      bones.forEach(([a, b]) => svg.appendChild(el('line', {
        x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: ghost, 'stroke-width': 7,
        'stroke-linecap': 'round', opacity: .55,
      })));
      svg.appendChild(el('circle', { cx: gs.head[0], cy: gs.head[1], r: 20, fill: 'none', stroke: ghost, 'stroke-width': 5, opacity: .55 }));
    });
  }

  push([
    el('ellipse', { cx: S.pelvis[0], cy: GROUND + 4, rx: 96, ry: 12, fill: floor, opacity: .25 }),
    el('line', { x1: S0.pelvis[0] - 220, y1: GROUND, x2: S0.pelvis[0] + 280, y2: GROUND, stroke: floor, 'stroke-width': 2 }),
  ]);

  if (view === 'front') {
    const F = frontPoints(e, p, S);
    const trunk = frontTrunk(F);
    const cx = F.cx;
    const bar = () => (F.barY === null ? [] : [
      el('rect', { x: cx - 152, y: F.barY - 5, width: 304, height: 10, rx: 5, fill: metal, stroke: line }),
      el('rect', { x: cx - 152, y: F.barY - 48, width: 15, height: 96, rx: 6, fill: metal, stroke: line }),
      el('rect', { x: cx + 137, y: F.barY - 48, width: 15, height: 96, rx: 6, fill: metal, stroke: line }),
    ]);
    if (e.bar === 'back') push(bar());
    [F.L, F.R].forEach((s) => {
      push([el('rect', { x: s.ankle[0] - 15, y: GROUND - 13, width: 30, height: 13, rx: 5, fill: skin, stroke: line })]);
      push(limb(s.hip, s.knee, 40, 32, 27, .42)); push(limb(s.knee, s.ankle, 27, 29, 15, .34));
      push([ball(s.knee, 13), ball(s.ankle, 9), ball(s.sh, 17)]);
      push(limb(s.sh, s.elbow, 24, 21, 17, .5)); push(limb(s.elbow, s.hand, 18, 18, 12, .3));
      push([ball(s.elbow, 10), el('circle', { cx: s.hand[0], cy: s.hand[1], r: 10, fill: skin, stroke: line })]);
      if (e.load === 'dumbbell') push(db(s.hand, s.elbow, false));
    });
    push([
      el('ellipse', { cx, cy: F.pelvis[1] + 8, rx: 38, ry: 25, fill: skin, stroke: line }),
      seg(F.pelvis, F.lumbar, 66, 56),
      el('ellipse', { cx, cy: trunk.cy, rx: trunk.rx, ry: trunk.ry, fill: skin, stroke: line }),
      seg(F.thorax, F.neck, 27, 24),
      el('ellipse', { cx: F.head[0], cy: F.head[1] - 3, rx: 23, ry: 27, fill: skin, stroke: line }),
    ]);
    if (e.bar === 'hands') push(bar());
    return drawHandles(svg, e, S, view);
  }

  if (e.prop === 'bar') push([
    el('rect', { x: S0.hand[0] - 150, y: BAR_Y - 6, width: 300, height: 12, rx: 6, fill: metal, stroke: line }),
    el('rect', { x: S0.hand[0] - 150, y: BAR_Y - 6, width: 12, height: 54, fill: metal, stroke: line }),
    el('rect', { x: S0.hand[0] + 138, y: BAR_Y - 6, width: 12, height: 54, fill: metal, stroke: line }),
  ]);
  if (e.prop === 'box') push([el('rect', { x: S0.ankle[0] - 62, y: S0.ankle[1] + 12, width: 150, height: Math.max(0, GROUND - S0.ankle[1] - 12), rx: 6, fill: surf2, stroke: line })]);
  if (e.prop === 'hipbench') push([
    el('rect', { x: S0.thorax[0] - 96, y: S0.thorax[1] + 26, width: 210, height: 18, rx: 8, fill: surf2, stroke: line }),
    el('rect', { x: S0.thorax[0] - 82, y: S0.thorax[1] + 44, width: 16, height: Math.max(0, GROUND - S0.thorax[1] - 44), fill: surf2, stroke: line }),
    el('rect', { x: S0.thorax[0] + 82, y: S0.thorax[1] + 44, width: 16, height: Math.max(0, GROUND - S0.thorax[1] - 44), fill: surf2, stroke: line }),
  ]);
  if (e.prop === 'bench' && e.mode === 'bench') {
    const t0 = poseAt(e, 0).p.torso;
    const deg = (Math.atan2(-Math.cos((t0 * Math.PI) / 180), Math.sin((t0 * Math.PI) / 180)) * 180) / Math.PI;
    svg.appendChild(el('g', { transform: `rotate(${deg} ${S0.pelvis[0]} ${S0.pelvis[1]})` }, [
      el('rect', { x: S0.pelvis[0] - 70, y: S0.pelvis[1] + 24, width: 330, height: 20, rx: 10, fill: surf2, stroke: line })]));
    push([el('rect', { x: S0.pelvis[0] - 56, y: S0.pelvis[1] + 44, width: 16, height: Math.max(0, GROUND - S0.pelvis[1] - 44), fill: surf2, stroke: line })]);
  }
  if (e.prop === 'bench' && e.mode !== 'bench') push([
    el('rect', { x: S0.ankleF[0] - 70, y: S0.ankleF[1] + 16, width: 150, height: 16, rx: 8, fill: surf2, stroke: line }),
  ]);

  const pin = e.prop !== 'box' && p.ankleLift > 0;
  push([el('path', { d: footPath(S.ankleF, footDirFor(e.mode), pin), fill: skinFar, stroke: line })]);
  push(limb(S.hipF, S.kneeF, 38, 30, 24, .42, true)); push(limb(S.kneeF, S.ankleF, 24, 25, 12, .34, true));
  push([ball(S.kneeF, 12, true)]);
  push(limb(S.shF, S.elbowF, 23, 21, 16, .5, true)); push(limb(S.elbowF, S.handF, 17, 17, 11, .3, true));
  push([ball(S.elbowF, 9, true), ball(S.handF, 9, true)]);
  if (e.bar === 'back' || e.bar === 'hips') push(plate(S.bar));

  const pelvisMid = add(S.pelvis, D(p.torso), 12), thoraxMid = lerpP(S.lumbar, S.thorax, .55);
  push([
    el('ellipse', { cx: pelvisMid[0], cy: pelvisMid[1], rx: 25, ry: 21, fill: skin, stroke: line, transform: `rotate(${p.torso} ${pelvisMid[0]} ${pelvisMid[1]})` }),
    seg(S.pelvis, S.lumbar, 40, 33),
    el('ellipse', { cx: thoraxMid[0], cy: thoraxMid[1], rx: 27, ry: 47, fill: skin, stroke: line, transform: `rotate(${p.thoraxA} ${thoraxMid[0]} ${thoraxMid[1]})` }),
    seg(S.thorax, S.neck, 21, 19), ball(S.sh, 17),
  ]);
  push([el('path', { d: footPath(S.ankle, footDirFor(e.mode), pin), fill: skin, stroke: line })]);
  push(limb(S.pelvis, S.knee, 42, 33, 26, .42)); push(limb(S.knee, S.ankle, 26, 28, 13, .34));
  push([ball(S.knee, 13), ball(S.ankle, 9)]);
  push(limb(S.sh, S.elbow, 25, 22, 17, .5)); push(limb(S.elbow, S.hand, 18, 18, 12, .3));
  push([ball(S.elbow, 10)]);
  if (e.bar === 'hands') push(plate(S.bar));
  push([el('circle', { cx: S.hand[0], cy: S.hand[1], r: 10, fill: skin, stroke: line }),
        el('circle', { cx: S.handF[0], cy: S.handF[1], r: 9, fill: skinFar, stroke: line })]);
  if (e.load === 'dumbbell') { push(db(S.handF, S.elbowF, true)); push(db(S.hand, S.elbow, false)); }
  svg.appendChild(el('g', { transform: `rotate(${p.neckA} ${S.head[0]} ${S.head[1]})` }, [
    el('ellipse', { cx: S.head[0], cy: S.head[1] - 3, rx: 23, ry: 26, fill: skin, stroke: line }),
    el('path', { d: `M ${S.head[0] - 4} ${S.head[1] + 4} L ${S.head[0] + 21} ${S.head[1] + 6} L ${S.head[0] + 14} ${S.head[1] + 23} L ${S.head[0] - 8} ${S.head[1] + 22} Z`, fill: skin, stroke: line })]));

  drawHandles(svg, e, S, view);
}

/** Tutamaklar yalnızca kare düzenlenirken; ara karede poz kimseye ait değil. */
function drawHandles(svg, e, S, view) {
  if (!editable() || view === 'front') return;
  const accent = css('--p');
  dragHandles(e, S).forEach((h) => {
    const g = el('g', { class: 'handle', 'data-joint': h.joint });
    g.appendChild(el('circle', { cx: h.at[0], cy: h.at[1], r: 15, fill: 'transparent' }));
    g.appendChild(el('circle', { cx: h.at[0], cy: h.at[1], r: 7, fill: 'none', stroke: accent, 'stroke-width': 2, opacity: h.far ? .5 : 1 }));
    g.appendChild(el('circle', { cx: h.at[0], cy: h.at[1], r: 2.4, fill: accent, opacity: h.far ? .5 : 1 }));
    const title = el('title', {});
    title.textContent = h.label;
    g.appendChild(title);
    // Etiket sürüklerken görünür: hangi eklemi tuttuğun halkadan anlaşılmıyor.
    if (dragging === h.joint) {
      const t = el('text', { x: h.at[0] + 14, y: h.at[1] - 12, fill: accent, 'font-size': 15, 'font-weight': 700 });
      t.textContent = h.label;
      g.appendChild(t);
    }
    svg.appendChild(g);
  });
}

// --- sürükleme -----------------------------------------------------------

/** Ekran noktasını viewBox koordinatına çevirir. */
function toWorld(evt) {
  const svg = $('stage');
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const m = svg.getScreenCTM().inverse();
  const q = pt.matrixTransform(m);
  return [q.x, q.y];
}

function startDrag(evt) {
  const g = evt.target.closest && evt.target.closest('.handle');
  if (!g || !editable()) return;
  snapshot();
  dragging = g.dataset.joint;
  if (evt.pointerId != null && $('stage').setPointerCapture) {
    try { $('stage').setPointerCapture(evt.pointerId); } catch { /* yakalama zorunlu değil */ }
  }
  evt.preventDefault();
}

function moveDrag(evt) {
  if (!dragging) return;
  const e = ex();
  const S = skeleton(e, fillPose(frame().p));
  const patch = dragJoint(e, S, dragging, toWorld(evt));
  if (Object.keys(patch).length === 0) return;
  frame().p = applyPatch(frame().p, patch);
  markDirty();
  draw();
  renderSliders();
  renderIssues();
}

const endDrag = () => {
  if (dragging) {
    dragging = null;
    draw();
  }
};

// Hem pointer hem mouse: bazı girdi yolları (dokunmatik sürücüler, uzaktan
// kumanda edilen tarayıcılar) pointer olayı üretmiyor ve tutamak ölü kalıyor.
$('stage').addEventListener('pointerdown', startDrag);
$('stage').addEventListener('pointermove', moveDrag);
$('stage').addEventListener('pointerup', endDrag);
$('stage').addEventListener('pointercancel', endDrag);
$('stage').addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', moveDrag);
window.addEventListener('mouseup', endDrag);

// --- paneller ------------------------------------------------------------

function markDirty() {
  dirty = true;
  $('savedMsg').textContent = 'kaydedilmedi';
  $('savedMsg').style.color = css('--warn');
  // Sürükleme zaman çubuğunu yeniden çizmiyor; geri al düğmesi devre dışı
  // kalırsa ilk sürüklemeden sonra geri alma tıklanamıyor.
  syncHistoryButtons();
}

function syncHistoryButtons() {
  $('undo').disabled = undoStack.length === 0;
  $('redo').disabled = redoStack.length === 0;
}

function renderExList() {
  const host = $('exList');
  host.innerHTML = '';
  Object.keys(DATA).forEach((k) => {
    // Anahtar (`hip_hinge_dumbbell`) kimsenin kafasındaki isim değil;
    // kütüphanedeki Türkçe adlar üstte, anahtar altta.
    const names = NAMES[k] || [];
    const label = names[0] || k;
    const hay = (label + ' ' + names.join(' ') + ' ' + k).toLowerCase();
    if (filter && !hay.includes(filter)) return;
    const issues = auditExercise(DATA[k]).length + auditLoop(DATA[k]).length;
    const b = document.createElement('button');
    b.setAttribute('aria-pressed', String(k === key));
    b.innerHTML =
      `${issues ? `<span class="bad">${issues}</span>` : ''}` +
      `${DATA[k].view === 'front' ? '<span class="front">ÖNDEN</span>' : ''}` +
      `<b>${label}</b><small>${names.length > 1 ? names.slice(1).join(', ') + ' · ' : ''}${k}</small>`;
    b.onclick = () => { key = k; kfIndex = 0; playing = false; scrubT = null; renderAll(); };
    host.appendChild(b);
  });
  if (!host.children.length) host.innerHTML = '<p class="hint">Eşleşen hareket yok.</p>';
}

function renderKf() {
  const e = ex();
  const ticks = $('ticks');
  ticks.innerHTML = '';
  e.kf.forEach((k, i) => {
    const tick = document.createElement('i');
    tick.style.left = `${k.t * 100}%`;
    if (i === kfIndex && editable()) tick.className = 'on';
    tick.title = k.tr;
    ticks.appendChild(tick);
    // Etiket yalnızca seçili kare için: yan yana iki kare (%42 ve %55 gibi)
    // etiketleri üst üste bindiriyor ve ikisi de okunmuyor.
    if (i === kfIndex && editable()) {
      const lbl = document.createElement('span');
      lbl.style.left = `${Math.min(94, Math.max(6, k.t * 100))}%`;
      lbl.textContent = `${k.tr} · %${(k.t * 100).toFixed(0)}`;
      ticks.appendChild(lbl);
    }
  });
  $('scrub').value = String(Math.round(currentT() * 1000));
  $('kfName').value = frame().tr ?? '';
  $('kfTime').value = String(frame().t);
  // Önden görünüm yan çözümden türeyen şematik bir izdüşüm: orada sürüklenecek
  // bağımsız bir eklem yok. Bunu söylemek, tutamakları arayan birini
  // "bozuk mu?" sorusundan kurtarıyor.
  const planeNote = plane === 'front' ? ' · önden görünümde sürükleme yok, açıları sağdan düzenle' : '';
  $('frameInfo').textContent = playing
    ? `oynuyor · %${(playT * 100).toFixed(0)}`
    : scrubT !== null
      ? `ara kare · %${(scrubT * 100).toFixed(0)} — düzenlemek için bir kareye dön`
      : `kare ${kfIndex + 1}/${e.kf.length} · %${(frame().t * 100).toFixed(0)} ${frame().tr}${planeNote}`;
  $('delKf').disabled = e.kf.length <= 2;
  $('undo').disabled = undoStack.length === 0;
  $('redo').disabled = redoStack.length === 0;
}

/** Bu harekette hangi alanların anlamı var — gerisi gürültü. */
function relevantFields(e) {
  const out = ['shinA', 'thighA', 'torso', 'thoraxA', 'neckA'];
  if (e.arm === 'angles') out.push('upperA', 'foreA');
  else out.push('hx');
  if (e.arm === 'ik') out.push('hy');
  out.push('thighF', 'shinF');
  if (e.arm === 'angles') out.push('upperF', 'foreF');
  if (e.view === 'front') out.push('hxF', 'shLift');
  if (e.mode === 'stand') out.push('ankleLift');
  return out;
}

function renderSliders() {
  const host = $('sliders');
  const e = ex();
  const p = fillPose(frame().p);
  const fields = relevantFields(e);
  $('anglesTitle').textContent = editable() ? 'Açılar' : 'Açılar (ara kare — salt okunur)';
  host.innerHTML = '';
  ANGLES.filter(([f]) => fields.includes(f)).forEach(([field, label, min, max]) => {
    const row = document.createElement('div');
    row.className = 'row';
    const value = Math.round(p[field] * 10) / 10;
    row.innerHTML = `<label for="s_${field}">${label}</label>
      <input id="s_${field}" type="range" min="${min}" max="${max}" step="0.5" value="${value}" ${editable() ? '' : 'disabled'}>
      <input id="n_${field}" type="number" step="0.5" value="${value}" ${editable() ? '' : 'disabled'}>`;
    const range = row.querySelector('input[type=range]');
    const num = row.querySelector('input[type=number]');
    let live = false;
    const set = (v, from) => {
      if (!editable()) return;
      // Sürükleme başına tek anlık görüntü: her pikselde bir tane alınırsa
      // geri alma yığını tek hamleyi yüzlerce adıma bölüyor.
      if (!live) { snapshot(); live = true; }
      frame().p = applyPatch(frame().p, { [field]: Number(v) });
      if (from !== 'range') range.value = String(v);
      if (from !== 'num') num.value = String(v);
      markDirty();
      draw();
      renderIssues();
    };
    range.oninput = () => set(range.value, 'range');
    range.onchange = () => { live = false; };
    num.onchange = () => { set(num.value, 'num'); live = false; };
    // Ok tuşları: kaydırıcı üstünde 1°, Shift ile 5°.
    range.onkeydown = (evt) => {
      const step = evt.shiftKey ? 5 : 1;
      if (evt.key === 'ArrowUp' || evt.key === 'ArrowRight') { set(Number(range.value) + step, null); evt.preventDefault(); }
      if (evt.key === 'ArrowDown' || evt.key === 'ArrowLeft') { set(Number(range.value) - step, null); evt.preventDefault(); }
      live = false;
    };
    host.appendChild(row);
  });
}

function renderIssues() {
  const host = $('issues');
  const e = ex();
  const here = editable() ? auditFrame(e, fillPose(frame().p), frame().t) : auditFrame(e, currentPose(), currentT());
  const whole = [...auditExercise(e), ...auditLoop(e)];
  host.innerHTML = '';
  if (here.length === 0 && whole.length === 0) {
    host.innerHTML = '<div class="ok">✓ bu hareket temiz</div>';
    return;
  }
  const seen = new Set();
  const add = (label, issue, jump) => {
    const text = `${label} · ${issue.message}`;
    if (seen.has(text)) return;
    seen.add(text);
    const b = document.createElement('button');
    b.textContent = text;
    // Sorunun yaşandığı ana gitmek: hatayı görmeden düzeltmek zor.
    b.onclick = () => {
      if (jump !== null) goToTime(jump);
      renderAll();
    };
    host.appendChild(b);
  };
  here.forEach((i) => add('bu kare', i, null));
  whole.forEach((i) => add(`%${(i.t * 100).toFixed(0)}`, i, i.t));
}

function renderEquipment() {
  const e = ex();
  const bind = (id, opts, value, apply) => {
    const sel = $(id);
    sel.innerHTML = '';
    opts.forEach(([v, label]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.onchange = () => { apply(sel.value); markDirty(); renderAll(); };
  };
  bind('mode', OPTIONS.mode, e.mode, (v) => (e.mode = v));
  bind('arm', OPTIONS.arm, e.arm, (v) => (e.arm = v));
  bind('barSel', OPTIONS.bar, e.bar ?? '', (v) => (e.bar = v || null));
  bind('load', OPTIONS.load, e.load ?? '', (v) => (v ? (e.load = v) : delete e.load));
  bind('prop', OPTIONS.prop, e.prop ?? '', (v) => (v ? (e.prop = v) : delete e.prop));
  bind('viewSel', OPTIONS.view, e.view ?? 'side', (v) => (v === 'side' ? delete e.view : (e.view = v)));
  bind('bend', OPTIONS.bend, String(e.bend), (v) => (e.bend = Number(v)));
  $('dur').value = String(e.dur);
  $('dur').onchange = () => { const n = Number($('dur').value); if (n > 500) { e.dur = n; markDirty(); } };
}

function renderAll() {
  renderExList();
  renderKf();
  renderSliders();
  renderEquipment();
  renderIssues();
  draw();
}

// --- kare işlemleri ------------------------------------------------------

$('addKf').onclick = () => {
  snapshot();
  const e = ex();
  const cur = e.kf[kfIndex];
  const next = e.kf[kfIndex + 1];
  const t = next ? (cur.t + next.t) / 2 : Math.min(1, cur.t + 0.1);
  e.kf.splice(kfIndex + 1, 0, { t: Math.round(t * 100) / 100, tr: cur.tr, p: { ...cur.p } });
  kfIndex += 1;
  markDirty();
  renderAll();
};

$('delKf').onclick = () => {
  const e = ex();
  if (e.kf.length <= 2) return;
  snapshot();
  e.kf.splice(kfIndex, 1);
  kfIndex = Math.max(0, kfIndex - 1);
  markDirty();
  renderAll();
};

$('kfName').onchange = () => { snapshot(); frame().tr = $('kfName').value; markDirty(); renderKf(); };

// Hareket sonsuz döner: son kare ilkinden farklıysa her tekrarda zıplıyor.
$('closeLoop').onclick = () => {
  snapshot();
  const e = ex();
  e.kf[e.kf.length - 1].p = { ...e.kf[0].p };
  markDirty();
  renderAll();
};
$('kfTime').onchange = () => {
  const t = Number($('kfTime').value);
  if (!(t >= 0 && t <= 1)) return;
  snapshot();
  frame().t = t;
  ex().kf.sort((a, b) => a.t - b.t);
  markDirty();
  renderAll();
};

// --- üst çubuk -----------------------------------------------------------

$('viewSide').onclick = () => { plane = 'side'; $('viewSide').setAttribute('aria-pressed', 'true'); $('viewFront').setAttribute('aria-pressed', 'false'); draw(); };
$('viewFront').onclick = () => { plane = 'front'; $('viewSide').setAttribute('aria-pressed', 'false'); $('viewFront').setAttribute('aria-pressed', 'true'); draw(); };

$('onion').onclick = () => {
  onion = !onion;
  $('onion').setAttribute('aria-pressed', String(onion));
  draw();
};

$('undo').onclick = () => {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(DATA));
  restore(undoStack.pop());
  markDirty();
};

$('redo').onclick = () => {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(DATA));
  restore(redoStack.pop());
  markDirty();
};

$('revert').onclick = async () => {
  if (dirty && !confirm('Kaydedilmemiş değişiklikler atılacak. Diskteki hâline dönülsün mü?')) return;
  snapshot();
  DATA = await (await fetch('/data')).json();
  if (!DATA[key]) key = Object.keys(DATA)[0];
  kfIndex = 0;
  dirty = false;
  $('savedMsg').textContent = 'diskten yüklendi';
  $('savedMsg').style.color = css('--sub');
  renderAll();
};

$('scrub').oninput = () => {
  goToTime(Number($('scrub').value) / 1000);
  renderAll();
};

$('play').onclick = () => {
  scrubT = null;
  playing = !playing;
  $('play').textContent = playing ? 'Durdur' : 'Oynat';
  $('play').setAttribute('aria-pressed', String(playing));
  renderAll();
};

$('save').onclick = async () => {
  $('save').disabled = true;
  try {
    const res = await fetch('/data', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(DATA, null, 2) });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error);
    dirty = false;
    $('savedMsg').textContent = `kaydedildi (${out.count} arketip)`;
    $('savedMsg').style.color = css('--p');
  } catch (e) {
    $('savedMsg').textContent = 'kaydedilemedi: ' + e.message;
    $('savedMsg').style.color = css('--danger');
  } finally {
    $('save').disabled = false;
  }
};

// Kısayollar: kaydetme ve geri alma, elin fareden kalkmadan.
window.addEventListener('keydown', (evt) => {
  const meta = evt.metaKey || evt.ctrlKey;
  if (meta && evt.key.toLowerCase() === 's') { evt.preventDefault(); $('save').click(); }
  if (meta && evt.key.toLowerCase() === 'z' && !evt.shiftKey) { evt.preventDefault(); $('undo').click(); }
  if (meta && evt.key.toLowerCase() === 'z' && evt.shiftKey) { evt.preventDefault(); $('redo').click(); }
  if (evt.key === ' ' && evt.target === document.body) { evt.preventDefault(); $('play').click(); }
});

$('search').oninput = () => { filter = $('search').value.trim().toLowerCase(); renderExList(); };

window.addEventListener('beforeunload', (e) => {
  if (!dirty) return;
  e.preventDefault();
  e.returnValue = '';
});

let last = 0;
function tick(now) {
  if (playing && now - last > 33) {
    last = now;
    playT = ((now / ex().dur) % 1 + 1) % 1;
    draw();
    $('frameInfo').textContent = `oynuyor · ${(playT * 100).toFixed(0)}%`;
  }
  requestAnimationFrame(tick);
}

const boot = async () => {
  const [data, names] = await Promise.all([
    fetch('/data').then((r) => r.json()),
    fetch('/names').then((r) => r.json()).catch(() => ({})),
  ]);
  DATA = data;
  NAMES = names;
  key = Object.keys(DATA)[0];
  renderAll();
  requestAnimationFrame(tick);
};
boot();
