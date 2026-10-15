#!/usr/bin/env python3
"""
GymEntra marka dosyaları — tek kaynak (15 Ekim 2026).

Logo: eğik halter. İç plakalar vurgu rengi (Volt limon), çubuk ve dış plakalar
açık. Her çıktı bu betikteki aynı geometriden üretilir; logoyu değiştirmek için
yalnızca `mark()` düzenlenir, sonra:

    python3 scripts/brand-assets.py

Gerekenler: `rsvg-convert` (brew install librsvg) ve Pillow.

Çıktılar
- assets/brand/*.svg          vektör ana dosyalar (düzenlenebilir)
- assets/images/              uygulama simgesi, Android uyarlanabilir simge
                              (ön plan, arka plan, tek renk), splash, bildirim simgesi
- ../gymentra-site/assets/    site logosu ve favicon'lar
- assets/brand/export/        mağaza simgesi (Play 512)

Android uyarlanabilir simgede içerik, 108 dp tuvalin ortadaki 66 dp'lik güvenli
dairesinin içinde kalmalı (maskeye göre kırpılır): ön plan bu yüzden küçük ölçekli.
"""
import os
import subprocess
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, '..', 'gymentra-site', 'assets')

BG = '#0B0F14'       # koyu zemin (uygulamanın koyu temasıyla aynı)
FG = '#F4F6F8'       # çubuk ve dış plakalar
AC = '#C8FF2E'       # Volt: iç plakalar
ROT = -18            # derece; eğim hem hareket hissi verir hem "H" harfinden ayırır


def mark(scale, fg=FG, ac=AC):
    """Eğik halter, 1024 tuvalin merkezinde."""
    return f'''<g transform="translate(512 512) rotate({ROT}) scale({scale}) translate(-512 -512)">
<rect x="300" y="480" width="424" height="64" rx="32" fill="{fg}"/>
<rect x="358" y="318" width="72" height="388" rx="36" fill="{ac}"/>
<rect x="594" y="318" width="72" height="388" rx="36" fill="{ac}"/>
<rect x="280" y="398" width="64" height="228" rx="32" fill="{fg}"/>
<rect x="680" y="398" width="64" height="228" rx="32" fill="{fg}"/>
</g>'''


def svg(body, bg=None, rx=0):
    rect = f'<rect width="1024" height="1024" rx="{rx}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
            f'{rect}{body}</svg>\n')


def render(svg_text, out, size, flatten=None):
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as f:
        f.write(svg_text)
        tmp = f.name
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), tmp, '-o', out], check=True)
    os.unlink(tmp)
    if flatten:  # App Store simgesi alfa kanalı taşımamalı
        Image.open(out).convert('RGB').save(out)


def max_radius(scale):
    """Şeklin tuval merkezinden en uzak opak pikseli (1024 tuvalde)."""
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'm.png')
        render(svg(mark(scale)), p, 1024)
        im = Image.open(p).split()[3]
        w, h = im.size
        px = im.load()
        far = 0.0
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                if px[x, y] > 8:
                    far = max(far, ((x - 512) ** 2 + (y - 512) ** 2) ** 0.5)
        return far


def scale_for_radius(target):
    r1 = max_radius(1.0)
    return target / r1


def main():
    brand = os.path.join(ROOT, 'assets', 'brand')
    images = os.path.join(ROOT, 'assets', 'images')
    export = os.path.join(brand, 'export')
    for d in (brand, images, export, SITE):
        os.makedirs(d, exist_ok=True)

    s_icon = 1.38                                   # tam kenar simge: içerik geniş durabilir
    s_adaptive = scale_for_radius(280)              # 66 dp güvenli dairenin (yarıçap ~313 px) içinde, kenarlara değmeden
    s_splash = scale_for_radius(400)
    s_notif = scale_for_radius(470)                 # bildirim simgesi tuvali doldurur (24 dp'lik küçük alan)

    masters = {
        'gymentra-icon.svg': svg(mark(s_icon), bg=BG),
        'gymentra-adaptive-foreground.svg': svg(mark(s_adaptive)),
        'gymentra-adaptive-monochrome.svg': svg(mark(s_adaptive, fg='#FFFFFF', ac='#FFFFFF')),
        'gymentra-adaptive-background.svg': svg('', bg=BG),
        'gymentra-splash.svg': svg(mark(s_splash)),
        'gymentra-notification.svg': svg(mark(s_notif, fg='#FFFFFF', ac='#FFFFFF')),
        'gymentra-site-logo.svg': svg(mark(s_icon), bg=BG, rx=224),
    }
    for name, text in masters.items():
        with open(os.path.join(brand, name), 'w') as f:
            f.write(text)

    render(masters['gymentra-icon.svg'], os.path.join(images, 'icon.png'), 1024, flatten=True)
    render(masters['gymentra-adaptive-foreground.svg'], os.path.join(images, 'android-icon-foreground.png'), 1024)
    render(masters['gymentra-adaptive-background.svg'], os.path.join(images, 'android-icon-background.png'), 1024, flatten=True)
    render(masters['gymentra-adaptive-monochrome.svg'], os.path.join(images, 'android-icon-monochrome.png'), 1024)
    render(masters['gymentra-splash.svg'], os.path.join(images, 'splash-icon.png'), 1024)
    # expo-notifications: 96x96, beyaz, şeffaf zeminli
    render(masters['gymentra-notification.svg'], os.path.join(images, 'notification-icon.png'), 96)

    render(masters['gymentra-site-logo.svg'], os.path.join(SITE, 'logo.png'), 600)
    render(masters['gymentra-icon.svg'], os.path.join(SITE, 'favicon.png'), 512, flatten=True)
    render(masters['gymentra-icon.svg'], os.path.join(SITE, 'favicon-32.png'), 32, flatten=True)
    render(masters['gymentra-icon.svg'], os.path.join(export, 'play-icon-512.png'), 512)
    print('ölçekler: simge %.3f, uyarlanabilir %.3f, splash %.3f' % (s_icon, s_adaptive, s_splash))


if __name__ == '__main__':
    main()
