# Hareket adları — antrenör onay tablosu

**Tarih:** 10 Eylül 2026 · **Kaynak:** `packages/rig/data/exercises.json`
(adın tek kaynağı; `build_exercise_library.py` oradan okuyor)

`docs/program_templates.md`'nin bıraktığı kaydı kapatmak için:
*"Türkçe hareket adlarının salonda kullanılan karşılıkları için gerçek
antrenör onayı önerilir."*

## Nasıl okunmalı

- **Birincil ad** uygulamada başlık olarak görünür. Hiçbiri bu turda
  değiştirilmedi: hepsi zaten bu deponun antrenör incelemesinden geçmiş
  şablonlarının kullandığı adlar. Eksik olan şey karşılıktı.
- **Karşılık** başlığın altında ve aramada geçer. Birincil Türkçeyse
  İngilizcesi, birincil yabancıysa Türkçesi.
- **Boş karşılık** bilerek boştur: o hareketin salonda söylenen ikinci bir
  adı yok. Kimsenin söylemediği bir Türkçe ad, adsızlıktan kötüdür.
- **YENİ** işaretli 12 hareket bu turda eklendi; pozları ve kas verisi
  henüz uzman onayı beklemektedir (`poseReviewed: false`, `reviewed: false`).

## Antrenöre sorulan tek soru

Her satır için: **salonda buna ne diyorsunuz?** İkisi yer değiştirmeli mi,
karşılık yanlış mı, boş bırakılan birinin aslında bir Türkçesi var mı?

| kimlik | birincil ad | karşılık | |
|---|---|---|---|
| `arm-circles` | Kol çevirme | Arm circles |  |
| `cat-cow` | Kedi-deve | Cat-cow |  |
| `band-pull-apart` | Bant pull-apart | — |  |
| `band-external-rotation` | Bant ile dış rotasyon | Band external rotation |  |
| `chin-tuck` | Çene içeri çekme | Chin tuck |  |
| `worlds-greatest-stretch` | Lunge + gövde rotasyonu | World's greatest stretch |  |
| `goblet-squat` | Goblet squat | — |  |
| `back-squat` | Back squat | — |  |
| `front-hack-squat` | Front squat | Ön squat |  |
| `rdl` | Romanian deadlift | Romen deadlift |  |
| `deadlift` | Deadlift | Ölü kaldırış |  |
| `hip-thrust` | Hip thrust | Kalça itişi |  |
| `bulgarian-split-squat` | Bulgarian split squat | — |  |
| `walking-lunge` | Walking lunge | Yürüyen hamle |  |
| `reverse-lunge` | Reverse lunge | Geriye hamle |  |
| `step-up` | Step-up | Basamak çıkma |  |
| `calf-raise` | Calf raise | Topuk yükseltme |  |
| `bench-press` | Bench press | Göğüs presi |  |
| `incline-press` | Incline dumbbell pres | Eğik sehpada dumbbell pres |  |
| `shoulder-press` | Omuz pres | Shoulder press |  |
| `barbell-row` | Barbell row | Barbell kürek çekme |  |
| `single-arm-row` | Tek kol dumbbell row | Tek kol kürek çekme |  |
| `reverse-fly` | Dumbbell reverse fly | Arka omuz açış |  |
| `lateral-raise` | Lateral raise | Yana açış |  |
| `biceps-curl` | Biceps curl | Kol bükme |  |
| `shrug` | Omuz silkme | Shrug |  |
| `plank` | Plank | — |  |
| `side-plank` | Side plank | Yan plank |  |
| `bird-dog` | Bird-dog | — |  |
| `pallof-press` | Pallof pres | — |  |
| `ab-wheel-rollout` | Ab wheel rollout | Tekerlekle açılma |  |
| `hanging-knee-raise` | Asılı diz çekme | Hanging knee raise |  |
| `suitcase-carry` | Suitcase carry | Tek el ağırlık taşıma |  |
| `glute-bridge` | Kalça köprüsü | Glute bridge |  |
| `leg-press` | Leg press | Bacak presi | YENİ |
| `leg-extension` | Leg extension | Ön bacak makinesi | YENİ |
| `leg-curl` | Leg curl | Arka bacak makinesi | YENİ |
| `lat-pulldown` | Lat pulldown | Lat çekişi | YENİ |
| `seated-cable-row` | Oturarak kürek | Seated cable row | YENİ |
| `chest-supported-row` | Göğüs destekli kürek | Chest-supported row | YENİ |
| `machine-chest-press` | Makine göğüs pres | Machine chest press | YENİ |
| `pullup` | Barfiks | Pull-up | YENİ |
| `triceps-pushdown` | Triceps pushdown | Triceps itişi | YENİ |
| `face-pull` | Yüz çekişi | Face pull | YENİ |
| `dead-bug` | Ölü böcek | Dead bug | YENİ |
| `mcgill-curl-up` | McGill curl-up | — | YENİ |

**46 hareket · karşılığı yazılan 38 · bilerek boş 8**
