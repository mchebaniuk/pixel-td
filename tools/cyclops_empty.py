# Делает assets/cyclops_empty.png из assets/cyclops.png — циклоп после броска, без валуна в руках.
# Координаты валуна (эллипс) подобраны под текущую картинку; для новой картинки их надо поправить.
# циклоп без валуна: валун стираем, за ним — живот (кожа с затемнением к краю), справа от живота — пусто
import numpy as np
from PIL import Image
from scipy import ndimage as nd
A = __file__.rsplit('/tools/', 1)[0] + '/assets'
im = np.asarray(Image.open(f'{A}/cyclops.png').convert('RGBA')).astype(np.float32)
H, W = im.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
rgb = im[..., :3]; al = im[..., 3] > 128
sat = rgb.max(-1) - rgb.min(-1)
# валун — эллипс; внутри него камень всё, что не кожа (у кожи красный заметно больше синего)
box = ((xx - 68.5) / 24.5) ** 2 + ((yy - 80) / 23.5) ** 2 <= 1
stone = al & box & (((rgb[..., 0] - rgb[..., 2]) < 32) | (rgb[..., 1] > 0.72 * rgb[..., 0]))
ring = ((xx - 68.5) / 27) ** 2 + ((yy - 80) / 26) ** 2 <= 1
stone |= al & ring & ~box & (rgb.sum(-1) < 240) & (xx > 0.6 * W)   # тёмный контур валуна
# не трогаем кисти: насыщенная кожа рядом остаётся
edge = 0.74 * W
chest = rgb[(yy > 0.2 * H) & (yy < 0.27 * H) & (xx > 0.5 * W) & (xx < 0.68 * W) & al]
skin = np.median(chest, 0)
out = im.copy()
inside = stone & (xx < edge)
shade = 1 - 0.35 * np.clip((xx - 0.5 * W) / (edge - 0.5 * W), 0, 1)
out[inside, :3] = skin * shade[inside, None]
out[inside, 3] = 255
out[stone & (xx >= edge), 3] = 0
out[(ring | ((yy > 60) & (yy < 104))) & (xx >= edge), 3] = 0   # всё справа от живота в пределах валуна (контур, обрывки дальней кисти) — пусто
# тёмный контур по краю живота
rim = inside & (xx >= edge - 1.5)
out[rim, :3] = np.array([60, 30, 18])
Image.fromarray(out.astype(np.uint8), 'RGBA').save(f'{A}/cyclops_empty.png')
