"""Makes the Indonesian (_id) versions of the lettered paper UI stickers.

Each sticker in codes/xrclient/public/ui2d keeps its paper (shape, colour,
shadow); only the words change. The old letters are found by their cream
colour (#FFF8EC), wiped by blending the paper on either side of them row by
row, the paper is widened or narrowed in its flat middle to fit the new
words, and the new words are set with the asset set's own paper glyphs
(atlas E on clear stickers, W on coloured paper) at the same letter height,
line top and centre, with the Indonesian texts approved for the game.

Check mode sets the English words again on the wiped paper and compares
with the original, which proves the size, place and spacing of the letters.

Usage: python scripts/ui-id.py           (writes <name>_id.webp)
       python scripts/ui-id.py --check   (reports the English rebuild error)
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

UI = Path(__file__).resolve().parent.parent / "codes" / "xrclient" / "public" / "ui2d"

# name: (English lines, Indonesian lines). Two lines only on the round stickers.
TEXTS = {
    "status_finding_table": (["FINDING YOUR TABLE"], ["MENCARI MEJAMU"]),
    "status_pinch_to_place": (["PINCH TO PLACE THE BOOK"], ["CUBIT UNTUK MENARUH BUKU"]),
    "status_ready": (["READY!"], ["SIAP!"]),
    "race_wave_1": (["WAVE 1 OF 3"], ["GELOMBANG 1 DARI 3"]),
    "race_wave_2": (["WAVE 2 OF 3"], ["GELOMBANG 2 DARI 3"]),
    "race_wave_3": (["WAVE 3 OF 3"], ["GELOMBANG 3 DARI 3"]),
    "race_boss_round": (["BOSS ROUND"], ["RONDE BOS"]),
    "race_double_points": (["DOUBLE POINTS!"], ["POIN GANDA!"]),
    "race_times_up": (["TIME'S", "UP!"], ["WAKTU", "HABIS!"]),
    "robot_nice_cobalt": (["NICE!"], ["MANTAP!"]),
    "robot_nice_teal": (["NICE!"], ["MANTAP!"]),
    "robot_yay_cobalt": (["YAY!"], ["HORE!"]),
    "robot_yay_teal": (["YAY!"], ["HORE!"]),
    "robot_got_it_cobalt": (["GOT IT!"], ["BERHASIL!"]),
    "robot_got_it_teal": (["GOT IT!"], ["BERHASIL!"]),
    "hint_pop_right_answer": (["POP THE RIGHT ANSWER"], ["LETUSKAN JAWABAN YANG BENAR"]),
    "feedback_try_again": (["TRY AGAIN!"], ["COBA LAGI!"]),
    "recap_title": (["RACE RESULTS"], ["HASIL LOMBA"]),
    "badge_label_best_comeback": (["BEST COMEBACK"], ["BANGKIT TERBAIK"]),
    "badge_label_most_improved": (["MOST IMPROVED"], ["PALING BERKEMBANG"]),
    "badge_label_sharpest_aim": (["SHARPEST AIM"], ["BIDIKAN TERTAJAM"]),
    "badge_label_steady_streak": (["STEADY STREAK"], ["BENAR BERUNTUN"]),
    "badge_label_brave_try": (["BRAVE TRY"], ["BERANI MENCOBA"]),
    "button_done": (["DONE"], ["SELESAI"]),
}

CREAM = np.array([255, 248, 236])


class Glyphs:
    def __init__(self) -> None:
        self.meta = json.loads((UI / "font" / "paper_glyphs.json").read_text(encoding="utf8"))
        self.atlas = {k: Image.open(UI.parent / self.meta["atlas"][k]).convert("RGBA") for k in ("E", "W")}
        manifest = json.loads((UI / "manifest.json").read_text(encoding="utf8"))
        self.letter_px = {a["name"]: a["letter_px"] for a in manifest["assets"]}

    def glyph(self, ch: str) -> dict | None:
        return None if ch == " " else self.meta["glyphs"][self.meta["aliases"].get(ch, ch)]

    def advance(self, ch: str) -> float:
        return self.meta["space_advance"] if ch == " " else self.glyph(ch)["advance"]

    def kern(self, a: str, b: str) -> float:
        return self.meta["kerning"].get(a + b, 0.0)

    def ink_width(self, text: str) -> float:
        """Width from the first letter's ink to the last one's, in 128 px units."""
        pen = 0.0
        for i, ch in enumerate(text):
            if i:
                pen += self.kern(text[i - 1], ch)
            pen += self.advance(ch)
        return pen - self.glyph(text[0])["lsb"] - self.glyph(text[-1])["rsb"]

    def draw(self, canvas: Image.Image, text: str, left_ink: float, top: float, height: float, atlas: str) -> None:
        s = height / self.meta["height"]
        pen = left_ink - self.glyph(text[0])["lsb"] * s
        for i, ch in enumerate(text):
            if i:
                pen += self.kern(text[i - 1], ch) * s
            g = self.glyph(ch)
            if g:
                x, y, w, h = g["cell"]
                ox, oy = g["origin"]
                # Subpixel place: scale the cell with its fractional offset baked in.
                fx, fy = pen - ox * s, top - oy * s
                ix, iy = int(np.floor(fx)), int(np.floor(fy))
                dx, dy = fx - ix, fy - iy
                cell = self.atlas[atlas].crop((x, y, x + w, y + h))
                big = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
                big.paste(cell, (0, 0))
                out_w, out_h = int(np.ceil((w + 2) * s + 1)), int(np.ceil((h + 2) * s + 1))
                # Affine resample keeps the fraction of a pixel the pen sits at.
                part = big.transform(
                    (out_w, out_h),
                    Image.Transform.AFFINE,
                    (1 / s, 0, -dx / s, 0, 1 / s, -dy / s),
                    resample=Image.Resampling.BICUBIC,
                )
                layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                layer.paste(part, (ix, iy))
                canvas.alpha_composite(layer)
            pen += self.advance(ch) * s


def lines_of(a: np.ndarray) -> list[tuple[int, int, int, int]]:
    """(top, bottom, left, right) of each row of cream letters, ink only."""
    cream = (a[..., 3] > 200) & (np.abs(a[..., :3].astype(int) - CREAM).max(axis=2) < 10)
    rows = np.where(cream.any(axis=1))[0]
    out, start = [], rows[0]
    for prev, r in zip(rows, list(rows[1:]) + [None]):
        if r is None or r - prev > 3:
            band = cream[start : prev + 1]
            cols = np.where(band.any(axis=0))[0]
            if prev - start > 8:
                out.append((int(start), int(prev + 1), int(cols[0]), int(cols[-1] + 1)))
            start = r
    return out


def wipe(a: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """Blends the paper left and right of `box` across it, row by row (premultiplied)."""
    t, b, l, r = box
    f = a.astype(float)
    f[..., :3] *= f[..., 3:] / 255
    out = f.copy()
    for y in range(t, b):
        left, right = f[y, l - 1], f[y, r]
        k = np.linspace(0, 1, r - l)[:, None]
        out[y, l:r] = left * (1 - k) + right * k
    alpha = out[..., 3:]
    out[..., :3] = np.where(alpha > 0, out[..., :3] * 255 / np.maximum(alpha, 1e-6), 0)
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def resize_middle(a: np.ndarray, at: int, extra: int) -> np.ndarray:
    """Widens (extra > 0) or narrows the paper at column `at`, where it is flat."""
    if extra > 0:
        return np.concatenate([a[:, :at], np.repeat(a[:, at : at + 1], extra, axis=1), a[:, at:]], axis=1)
    if extra < 0:
        return np.concatenate([a[:, : at + extra // 2], a[:, at - extra + extra // 2 :]], axis=1)
    return a


def build(name: str, words: list[str], g: Glyphs, english: list[str]) -> tuple[Image.Image, Image.Image]:
    src = Image.open(UI / next(UI.rglob(f"{name}.webp")).relative_to(UI)).convert("RGBA")
    a = np.array(src)
    found = lines_of(a)
    if len(found) != len(english):
        raise SystemExit(f"{name}: found {len(found)} lines of letters, expected {len(english)}")
    # Coloured paper takes atlas W; clear stickers (letters on a faint film) take E.
    atlas = "W" if coloured_bg(a, found) else "E"
    # The asset set's letter height; the cream rows measure a pixel short at the soft edges.
    height = float(g.letter_px[name])
    pad = int(round(height * 0.16)) + 3
    t = min(tp for tp, _, _, _ in found) - 3
    b = max(bt for _, bt, _, _ in found) + pad
    l = min(lf for _, _, lf, _ in found) - 3
    r = max(rt for _, _, _, rt in found) + pad
    blank = wipe(a, (t, b, l, r))

    old_w = max(rt - lf for _, _, lf, rt in found)
    cx = (l + r - pad + 3) / 2
    round_shape = name in ("race_times_up", "status_ready")
    scale = 1.0
    new_w = max(g.ink_width(w) for w in words) * height / g.meta["height"]
    extra = 0
    if round_shape:
        scale = min(1.0, old_w * 1.06 / new_w)
    else:
        # Same letter height as the English sticker; the paper takes the difference.
        extra = int(round(new_w - old_w))
    at = int(round(cx))
    paper = resize_middle(blank, at, extra)
    cx += extra / 2

    def setting(lines: list[str], sc: float, centre: float, img: np.ndarray) -> Image.Image:
        canvas = Image.fromarray(img.copy(), "RGBA")
        hh = height * sc
        tops = [bt - height + (height - hh) / 2 for _, bt, _, _ in found]
        if len(lines) == 1 and len(found) > 1:
            tops = [(found[0][0] + found[-1][1]) / 2 - hh / 2]
        for line, top in zip(lines, tops):
            w = g.ink_width(line) * hh / g.meta["height"]
            g.draw(canvas, line, centre - w / 2, top, hh, atlas)
        return canvas

    english_img = setting(english, 1.0, (l + r - pad + 3) / 2, blank)
    return setting(words, scale, cx, paper), english_img


def coloured_bg(a: np.ndarray, found: list) -> bool:
    """A solid coloured paper just above the first line of letters."""
    tp, _, lf, rt = found[0]
    row = a[max(tp - 4, 0), lf:rt]
    solid = row[row[:, 3] > 250]
    return len(solid) > 0.8 * len(row) and np.abs(solid[:, :3].astype(int) - CREAM).max(axis=1).mean() > 40


def main() -> None:
    check = "--check" in sys.argv
    g = Glyphs()
    worst = 0.0
    for name, (en, idn) in TEXTS.items():
        src = next(UI.rglob(f"{name}.webp"))
        made, english = build(name, idn, g, en)
        orig = np.array(Image.open(src).convert("RGBA")).astype(float)
        e = np.array(english).astype(float)
        # Error weighted by coverage, where the pixel shows.
        diff = np.abs(e[..., :3] * e[..., 3:] - orig[..., :3] * orig[..., 3:]) / 255
        err = float(diff.mean())
        worst = max(worst, err)
        if check:
            english.save(Path(sys.argv[-1]) / f"{name}_en_rebuilt.png") if len(sys.argv) > 2 else None
            print(f"{name:28} english rebuild mean error {err:.3f} (0-255)")
            continue
        out = src.with_name(f"{name}_id.webp")
        made.save(out, "WEBP", lossless=True, exact=True, method=6)
        print(f"{out.relative_to(UI)}  {made.size[0]}x{made.size[1]} (was {Image.open(src).size[0]})  rebuild error {err:.3f}")
    print(f"worst English rebuild error {worst:.3f}")


if __name__ == "__main__":
    main()
