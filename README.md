# litres book exporter

Firefox extension for exporting displayed Litres reader content locally to EPUB, FB2, or PDF. Version **0.6.1**, Firefox **142+**.

## Features

- English is the default UI language. Firefox automatically selects Russian for its Russian UI locale, using standard WebExtension localization.
- Manual capture and sequential automatic page turning, including raster images.
- Fast / normal / careful modes: minimum 0.3 / 0.6 / 2.5 seconds per page. Loading and saving may take longer.
- Local progress storage, block deduplication, pause and resume.
- EPUB with navigation, embedded PNG images, an optional cover and separate files for major chapters.
- FB2 with text, basic formatting, links, tables and embedded PNG images. Lists retain bullet or number prefixes as paragraphs; explicit line breaks become separate paragraphs, and major headings become section titles. FB2 page breaks depend on the reading application.
- PDF through a dedicated print view: click **Save as PDF / Print**, then select **Save to PDF** in Firefox. PDF is paginated by the browser, not downloaded directly by the extension.
- Capture statistics and diagnostics stay in the extension popup, outside the exported book.

The extension uses the currently authorized reader tab, its normal next-page control and displayed image URLs. It does not request the book's internal API or provide access to unavailable content.

## Install and update

For temporary installation, unpack the source ZIP and open `about:debugging#/runtime/this-firefox`. Choose **Load Temporary Add-on** and select `manifest.json`. Reload the book tab. Temporary installation ends when Firefox restarts.

For permanent installation, obtain a Mozilla-signed XPI. The generated `-unsigned.xpi` is for submission to Mozilla, not permanent local installation. See [signing instructions](docs/INSTALL-XPI.md).

The add-on ID remains unchanged. Upload version 0.6.1 through the existing add-on's version management page, not as a new add-on. Reload the reader tab after updating.

## Usage

1. Open a book at `https://www.litres.ru/static/reader/text/` and open the extension popup.
2. Select a speed and start automatic capture. Keep the reader tab active; keep the font and window size unchanged.
3. To resume, disable **Capture from the first page**. If the initial jump fails, move to the beginning manually.
4. Check the capture report if needed. Export is available as soon as text has been captured. Click **Book details and cover** to open a persistent editor tab and edit the title, author, language, publisher, publication year and description. Choose a PNG/JPEG/WebP cover: it is saved immediately, with a persistent preview and filename. Save text fields with **Save book details**, then return to the reader to export. These settings are stored per book; closing the popup does not clear them.
5. Select EPUB, FB2 or PDF and click **Export**. For PDF, use the print button on the new tab and choose the PDF destination. Disable browser headers and footers there if desired.

Selecting a format does not require recapturing the book. Existing exported files are not modified. Book text is not translated; only the extension interface is localized.

## Build

Python 3.9+, no additional dependencies:

```sh
python scripts/package.py
```

`dist/` receives a source ZIP and unsigned XPI. An explicit file allowlist excludes books, exported files and local test materials.

## Tests

Node.js 20+, no additional dependencies:

```sh
node --test tests/core.test.cjs
```

Optional browser integration tests require Playwright and Chromium:

```sh
node tests/formats.browser.cjs
```

Set `CHROME_PATH` to an installed Chromium executable if needed. Tests use synthetic data and write artifacts to a temporary directory. See [test coverage](docs/TESTING.md).

## Text formatting

Version 0.6.1 captures computed CSS while reading the page. EPUB and PDF retain bold/italic, underline/strikethrough, super/subscripts, alignment, relative font sizes, line height, letter spacing, paragraph indentation and vertical margins. Accent colors and highlights are preserved, while the reader's base text color is omitted to avoid copying white night-mode text onto a white page. Fonts use portable serif/sans-serif/monospace families; font files are not embedded.

Nested formatting overrides are respected, including normal text inside a bold/italic span. Inline formatting inside major headings is retained. Ordered lists preserve their start number. FB2 maps supported styling to strong/emphasis/strikethrough/sup/sub/code, retains explicit line breaks and preformatted indentation, and keeps list markers. FB2 does not support the full CSS model: underline, exact sizes, colors, alignment and spacing are not faithfully transferable. Line breaks inside FB2 table cells are represented by separators.

To capture CSS formatting, reload the reader after installing the update and repeat capture. Previously saved fragments do not contain the computed styles and cannot recover them through export alone. Repeated capture updates matching text blocks while retaining metadata and the selected cover.

This is not a pixel-identical copy of the webpage. Pseudo-elements, web fonts, complex positioning/layout and all decorative rules are outside the supported subset. Reading applications may override typography. PDF background highlighting also depends on print settings.

## Data and limitations

Text, images and progress are stored locally. There is no analytics or developer server. Image requests may access HTTPS URLs under `litres.ru` or `litres.com`; Firefox may include service cookies. Permissions are storage, downloads and these hosts. The manifest declares `websiteContent` for those image requests.

Completeness is not guaranteed. A complete-looking table of contents does not prove that all text is present. Capture pauses on failed images, stalled page turns or changing page counts. A faster mode can miss delayed content without a loading indicator; use the careful mode when needed.

Raster PNG/JPEG/GIF/WebP images are converted to PNG; animation is flattened. SVG, audio and video are not supported. Image limits are 10 MB and 24 million decoded pixels. Changes to the reader markup may require extension updates. Language defaults to Russian and can be edited per book. Metadata is not automatically imported from the complete Litres catalog. EPUB and FB2 include the edited fields and a standard cover reference. PDF receives the document title and a visual cover; other embedded PDF metadata is controlled by the browser print engine. Headings are recognized from h1/h2, short exact table-of-contents entries, standard section names and larger text during capture. Re-export saved books to apply TOC/name-based detection; detecting visual size requires recapturing those pages.

Calibre ebook-meta successfully read the metadata and extracted the cover from synthetic EPUB and FB2 exports. Local tests do not verify live Firefox capture, AMO approval, Kindle delivery, EPUBCheck or full FB2 XSD compliance. PDF rendering was checked in an isolated Chromium browser; Firefox's print dialog requires manual verification.
