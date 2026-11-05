"""Нарезка картинки персонажа с розового фона #FF00FF в assets/<name>.png.

    python3 tools/cut_sprite.py картинка.png name высота   (высота = игровая высота × 3, см. CLAUDE.md)
    python3 tools/cut_sprite.py башня.png tower 354         (башня ещё и подгоняется по цвету под текущую tower.png)

Убирает фон и розовую кайму, стирает тонкие линии (тетиву), обрезает и ужимает до нужной высоты.
Нужны Pillow, numpy, scipy.
"""
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
A = __file__.rsplit('/tools/', 1)[0] + '/assets'

def cut(path, H):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    key = np.minimum(R, B) - G                      # «розовость»: у фона ~255, у персонажей ≤ 0
    a = np.clip((150 - key) / 90, 0, 1)             # мягкая маска
    # снимаем примесь фона с полупрозрачных краёв: C = a·F + (1−a)·M
    M = np.array([255, 0, 255], np.float32)
    aa = np.maximum(a, 0.05)[..., None]
    F = np.clip((im - (1 - aa) * M) / aa, 0, 255)
    F = np.where((a < 1)[..., None], F, im)
    mask = a > 0.5
    # тонкие линии (тетива, искры сжатия) убираем: открытие, затем возвращаем края толстых частей
    op = nd.binary_opening(mask, structure=np.ones((7, 7)))
    mask &= nd.binary_dilation(op, iterations=3)
    lab, n = nd.label(mask)
    sizes = nd.sum(mask, lab, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 0.01 * sizes.max()]
    mask = np.isin(lab, keep)
    # остатки розового на краях (тёмная кайма с пурпурным оттенком) — уводим в нейтраль
    edge = mask & ~nd.binary_erosion(mask, iterations=3)
    Fr, Fg, Fb = F[..., 0], F[..., 1], F[..., 2]
    spill = np.clip(np.minimum(Fr, Fb) - Fg, 0, None) * edge
    F[..., 0] -= spill; F[..., 2] -= spill
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([F, mask * 255.0])[y0:y1, x0:x1].astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    W = round(img.width * H / img.height)
    out = img.convert('RGBa').resize((W, H), Image.BOX).convert('RGBA')
    return out, (x0, y0, x1, y1)

def match_hist(img, ref):
    a = np.asarray(img).astype(np.float32); r = np.asarray(ref).astype(np.float32)
    m, rm = a[..., 3] > 0, r[..., 3] > 0
    for c in range(3):
        src = a[..., c][m]; tgt = np.sort(r[..., c][rm])
        q = np.argsort(np.argsort(src)) / max(1, len(src) - 1)
        a[..., c][m] = tgt[(q * (len(tgt) - 1)).astype(int)]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')

if __name__ == '__main__':
    path, name, H = sys.argv[1], sys.argv[2], int(sys.argv[3])
    out, box = cut(path, H)
    if name == 'tower': out = match_hist(out, Image.open(f'{A}/tower.png').convert('RGBA'))
    out.save(f'{A}/{name}.png'); print(name, out.size)
