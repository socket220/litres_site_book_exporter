"""Build unsigned extension packages using only the Python standard library."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (
    "manifest.json", "core.js", "content.js", "background.js",
    "epub.js", "popup.html", "popup.css", "popup.js",
    "i18n.js", "formats.js", "print.html", "print.js", "print.css",
    "_locales/en/messages.json", "_locales/ru/messages.json",
)
SOURCE = RUNTIME + (
    "README.md", ".gitignore", "docs/INSTALL-XPI.md", "docs/TESTING.md",
    "scripts/package.py", "tests/core.test.cjs", "tests/formats.browser.cjs",
)

def build():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if not all(c.isdigit() or c == "." for c in version):
        raise ValueError("Unexpected manifest version")
    # Explicit allowlists: never package books, local profiles or exported data.
    for filename in SOURCE:
        if not (ROOT / filename).is_file():
            raise FileNotFoundError(filename)
    target = ROOT / "dist"
    target.mkdir(exist_ok=True)
    for suffix, names in (("-unsigned.xpi", RUNTIME), (".zip", SOURCE)):
        output = target / ("litres-book-exporter-v" + version + suffix)
        with ZipFile(output, "w", ZIP_DEFLATED) as archive:
            for filename in names:
                archive.write(ROOT / filename, filename)
        with ZipFile(output) as archive:
            if archive.testzip() is not None:
                raise RuntimeError("Corrupt ZIP archive")
        print(output)
    print("XPI is unsigned. Mozilla signing is required for permanent installation.")

if __name__ == "__main__":
    build()
