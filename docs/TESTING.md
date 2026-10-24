# Test coverage

Run `node --test tests/core.test.cjs` with Node.js 20+. These dependency-free tests cover parsing of runtime scripts, merge deduplication and conflicts, book isolation, missing content reports, EPUB image packaging, removal of the statistics page, locale coverage and stable add-on identity.

Run `node tests/formats.browser.cjs` with Playwright and Chromium available. Set `CHROME_PATH` to an installed Chromium executable if needed. Synthetic fixtures cover:

- Well-formed FB2 XML with Cyrillic text, metadata, formatting, lists, tables and embedded images.
- A printable DOM that excludes scripts, event handlers and remote image requests.
- English and Russian popups, format selection and export messages.
- The PDF page loading saved content and images before enabling its print button.
- Print controls hidden under print media, plus a generated sample PDF.

Artifacts are written to a temporary directory. No user books are included in the tests or packages.

Prior local checks also exercised automatic page turning, pause/resume, delayed or stalled transitions and image failures using a simulated reader. The current release does not change capture timing or navigation.

These checks do not confirm live Firefox behavior, AMO validation/signing, full FB2 XSD compliance, EPUBCheck, book completeness or delivery to Kindle. The native Firefox print dialog still needs manual verification.

Version 0.5.0 adds regression checks for cover manifest references, editable metadata, chapter splitting and cross-chapter links, metadata persistence, and heading font sizes relative to body text. Calibre ebook-meta successfully extracted metadata and covers from synthetic EPUB and FB2 exports.

Version 0.6.0 adds `node tests/styles.browser.cjs` (Playwright + Chromium): CSS-only formatting, nested normal overrides, relative typography, dark-theme base text color normalization, accent colors, heading inline markup, EPUB styles, FB2 line breaks and lists, preformatted indentation, and safe PDF styles. A synthetic PDF and screenshot are generated for visual inspection.
