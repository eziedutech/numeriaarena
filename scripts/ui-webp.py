"""Turns the paper UI images in codes/xrclient/public/ui2d into lossless WebP.

Lossless WebP keeps every pixel of the asset set's PNGs and is about a third
of their size (2.6 MB to 0.84 MB on 2 Oct 2026), which matters on slow school
networks. Each PNG is replaced by its .webp, and the glyph atlas list in
paper_glyphs.json follows. Run after scripts/sync-assets.mjs (it calls this).
Usage: python scripts/ui-webp.py
"""

import json
from pathlib import Path

from PIL import Image

UI = Path(__file__).resolve().parent.parent / "codes" / "xrclient" / "public" / "ui2d"


def main() -> None:
    before = after = 0
    for png in sorted(UI.rglob("*.png")):
        webp = png.with_suffix(".webp")
        with Image.open(png) as im:
            im.load()
            # exact keeps the colour under transparent pixels, which texture filtering samples.
            im.save(webp, "WEBP", lossless=True, exact=True, method=6)
        # Same pixels, or the PNG stays and the run stops.
        with Image.open(png) as a, Image.open(webp) as b:
            if a.convert("RGBA").tobytes() != b.convert("RGBA").tobytes():
                webp.unlink()
                raise SystemExit(f"{webp.name}: pixels differ, kept the PNG")
        before += png.stat().st_size
        after += webp.stat().st_size
        png.unlink()
    # The record of synced files names the WebP files the game now loads.
    manifest = UI / "manifest.json"
    if manifest.exists():
        text = manifest.read_text(encoding="utf8")
        manifest.write_text(text.replace('.png"', '.webp"'), encoding="utf8")
    glyphs = UI / "font" / "paper_glyphs.json"
    if glyphs.exists():
        data = json.loads(glyphs.read_text(encoding="utf8"))
        for key, value in data.get("atlas", {}).items():
            if isinstance(value, str) and value.endswith(".png"):
                data["atlas"][key] = value[: -len(".png")] + ".webp"
        glyphs.write_text(json.dumps(data) + "\n", encoding="utf8")
    print(f"ui2d: {before // 1024} KB of PNG became {after // 1024} KB of WebP")


if __name__ == "__main__":
    main()
