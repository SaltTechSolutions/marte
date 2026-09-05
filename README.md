# Antrenman Simülatörü

Hareket figürünün motoru, kare editörü ve mekanik denetimi. Kendi başına
çalışır; GymEntra yalnızca **çıktısını** tüketir.

```bash
npm install
npm run editor      # http://127.0.0.1:8123 — hareketleri düzenle
npm test            # mekanik denetim (29 test)
npm run export      # uygulamaya devredilecek dosyaları dist/ altına üretir
```

## Neden ayrı

Motor, editör ve denetim birlikte gelişiyor ve hızlı değişiyor; uygulamanın
ihtiyacı olan şey ise yalnızca "şu hareket şöyle görünüyor". İkisini aynı
depoda tutmak, her poz denemesini uygulamanın test ve derleme döngüsüne
sokuyordu.

## Ne var, ne yok

| Burada | Uygulamada |
|---|---|
| Motor (`src/rig.ts`) | Aynısının kopyası (`dist/` üzerinden) |
| Sürükleme çözücüsü (`src/rigEdit.ts`) | **Yok** — yalnızca editörün işi |
| Denetim kuralları (`src/rigAudit.ts`) | Aynısının kopyası |
| Kare verisi (`data/rigArchetypes.json`) | Aynısının kopyası |
| Editör (`editor/`, `scripts/editor.mjs`) | **Yok** |
| React Native çizimi | **Yalnızca uygulamada** (`RigFigure.tsx`) |

Çizim iki yerde ayrı yazılmak zorunda: burada tarayıcı SVG'si, uygulamada
`react-native-svg`. Ama **kinematik tek yerde** — figürün nereye geldiğini
hesaplayan kod yalnızca burada yaşıyor, uygulamaya kopyalanıyor.

## Devir sözleşmesi

`npm run export` üç dosya üretir:

```
dist/rig.ts               motor
dist/rigAudit.ts          denetim kuralları
dist/rigArchetypes.json   30 arketipin kare verisi
```

Uygulamada bunlar `src/vendor/rig/` altına kopyalanır ve başlarındaki
"üretilmiştir, elle düzenleme" satırı orada da durur. **Tek yön vardır:**
simülatörden uygulamaya. Uygulamada düzeltilen bir açı, bir sonraki devirde
sessizce geri gelir.

## Modeli bilmeden dokunma

- Açılar dünya uzayında, derece: 0 = yukarı, saat yönünde artar. Figür +x
  yönüne bakar.
- Kareler AÇI tutar, koordinat değil; segment boyları sabit. Geçiş eklem-yerel
  uzayda yapılır — bu yüzden uzuvlar bükülür, kendi etraflarında dönmez.
- Beş kök nokta: ayak yerde, dört ayak, sehpa, sırtüstü, barda asılı. Bir
  hareketin nereye bastığı çizimin temelidir.
- Önden görünüm, yan çözümün dikey seviyelerini okuyan şematik bir
  izdüşümdür; bağımsız bir 3B model yok. Gövde rotasyonu gibi gerçek dönüşler
  bu modelde temsil edilemiyor.

## Editör

Solda hareketler (Türkçe adlar `data/exerciseNames.json`'dan), ortada figür ve
zaman çubuğu, sağda denetim + ekipman + açılar.

- Eklemi tut ve sürükle. Kemik boyu sabit: eklem hedefe bakan yöne döner.
  Kalçayı sürüklemek iki kemiği birden çözer (çömelme derinliği).
- Zaman çubuğu kareler ARASINI da gösterir — geçiş hataları orada yaşar.
  Ara karede düzenleme kapalıdır.
- Gölge komşu karelerin izini çizer.
- Denetim uyarısına tıklamak sorunun yaşandığı ana götürür.
- `⌘Z` / `⇧⌘Z` / `⌘S`, boşluk oynatır, ok tuşları seçili kaydırıcıyı 1° (Shift
  ile 5°) oynatır. **Diske dön** kaydedilmemiş her şeyi atar.

Kaydet doğrudan `data/rigArchetypes.json` üstüne yazar; değişiklik git
diff'inde görünür.

## Denetim kuralları tek yerde

`src/rigAudit.ts` hem testlerde hem editörde çalışır: editörde kırmızı görünen
bir şey testte de düşer. Kurallar mekaniği koruyor — eklem zeminin altına
geçemez, basan ayak kalkamaz, diz ve dirsek ters kırılamaz, desteğe yaslanan
hareketlerde omuz kaymaz, döngü kapanmak zorunda.

## Sırada ne var

- Uygulama tarafını `src/vendor/rig/` düzenine geçirmek (bugün kendi
  kopyasını taşıyor; devir sözleşmesi henüz bağlanmadı).
- Hareket başına kaslar ve anlatım metni de buradan devredilebilir — bugün
  onlar uygulamanın kütüphanesinde.
