# litres book exporter

Firefox extension for exporting displayed Litres reader content locally to EPUB, FB2, or PDF. Version **0.4.0**, Firefox **142+**.

## Features

- English is the default UI language. Firefox automatically selects Russian for its Russian UI locale, using standard WebExtension localization.
- Manual capture and sequential automatic page turning, including raster images.
- Fast / normal / careful modes: minimum 0.3 / 0.6 / 2.5 seconds per page. Loading and saving may take longer.
- Local progress storage, block deduplication, pause and resume.
- EPUB with navigation and embedded PNG images.
- FB2 with text, basic formatting, links, tables and embedded PNG images. Lists are converted to paragraphs; headings become subtitles.
- PDF through a dedicated print view: click **Save as PDF / Print**, then select **Save to PDF** in Firefox. PDF is paginated by the browser, not downloaded directly by the extension.
- Capture statistics and diagnostics stay in the extension popup, outside the exported book.

The extension uses the currently authorized reader tab, its normal next-page control and displayed image URLs. It does not request the book's internal API or provide access to unavailable content.

## Install and update

For temporary installation, unpack the source ZIP and open `about:debugging#/runtime/this-firefox`. Choose **Load Temporary Add-on** and select `manifest.json`. Reload the book tab. Temporary installation ends when Firefox restarts.

For permanent installation, obtain a Mozilla-signed XPI. The generated `-unsigned.xpi` is for submission to Mozilla, not permanent local installation. See [signing instructions](docs/INSTALL-XPI.md).

The add-on ID remains unchanged. Upload version 0.4.0 through the existing add-on's version management page, not as a new add-on. Reload the reader tab after updating.

## Usage

1. Open a book at `https://www.litres.ru/static/reader/text/` and open the extension popup.
2. Select a speed and start automatic capture. Keep the reader tab active; keep the font and window size unchanged.
3. To resume, disable **Capture from the first page**. If the initial jump fails, move to the beginning manually.
4. Check the report and acknowledge that the export may be incomplete.
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

## Data and limitations

Text, images and progress are stored locally. There is no analytics or developer server. Image requests may access HTTPS URLs under `litres.ru` or `litres.com`; Firefox may include service cookies. Permissions are storage, downloads and these hosts. The manifest declares `websiteContent` for those image requests.

Completeness is not guaranteed. A complete-looking table of contents does not prove that all text is present. Capture pauses on failed images, stalled page turns or changing page counts. A faster mode can miss delayed content without a loading indicator; use the careful mode when needed.

Raster PNG/JPEG/GIF/WebP images are converted to PNG; animation is flattened. SVG, audio and video are not supported. Image limits are 10 MB and 24 million decoded pixels. Changes to the reader markup may require extension updates. FB2 and EPUB currently retain the reader's existing Russian language metadata.

Local tests do not verify live Firefox capture, AMO approval, Kindle delivery, EPUBCheck or full FB2 XSD compliance. PDF rendering was checked in an isolated Chromium browser; Firefox's print dialog requires manual verification.
