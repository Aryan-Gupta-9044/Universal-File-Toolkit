# Universal File Toolkit

A single-page, no-backend file toolkit: documents, images, audio, video, and
archives, all converted and edited **inside the browser**. Nothing you drop
onto it ever leaves your machine — there's no server, no upload, no account.

## Why no backend?

Every tool runs client-side with WebAssembly / JS libraries:

| Category  | Library                          | Runs where |
|-----------|-----------------------------------|------------|
| PDF       | `pdf-lib` + `pdf.js`              | Browser (WASM-free, pure JS) |
| Word      | `mammoth.js` + `jsPDF`/`html2canvas` + `docx` | Browser |
| Images    | Canvas API                        | Browser |
| Archives  | `JSZip`                           | Browser |
| Audio/Video | `ffmpeg.wasm` (0.11)            | Browser (WebAssembly) |

This means it's a **static site** — deployable to GitHub Pages, Netlify,
Vercel, S3, anywhere. `index.html` is the entire app; open it directly or
serve the folder with any static server.

```bash
# from this folder
python3 -m http.server 8080
# then open http://localhost:8080
```

> Opening `index.html` directly via `file://` mostly works, but some browsers
> block Web Workers (needed by pdf.js and ffmpeg.wasm) on `file://`. Serving
> it over `http://localhost` avoids that entirely.

## Project layout

```
universal-file-toolkit/
├── index.html            # markup + CDN library tags
├── css/style.css         # design system (the "workshop" theme)
├── js/
│   ├── app.js             # station/tool routing, drop zone, shared UI helpers
│   ├── lib-loader.js      # lazy-loads heavy libs (ffmpeg.wasm) on first use
│   └── modules/
│       ├── images.js      # convert / resize / compress / crop
│       ├── pdf.js         # merge / split / compress / (PDF ⇄ preview)
│       ├── docs.js        # Word ⇄ PDF
│       ├── archive.js     # zip / extract
│       ├── audio.js       # convert / trim / compress
│       └── video.js       # convert / compress / resize
├── ROADMAP.md
└── README.md
```

Each module exports plain functions and knows nothing about the others —
adding a new tool means adding one function to a module (or a new module)
and one entry in the `STATIONS` config at the top of `js/app.js`. That's the
whole extension point.

## Design concept

The UI is a **workbench**: drop a file on the surface and the tool
"stations" that can accept it light up, like routing a part to the right
machine on a shop floor. Pick a lit tool, it opens with your file already
loaded. See `ROADMAP.md` for the design tokens if you want to re-skin it.

## Honest limitations (read before you demo this)

- **PDF → Word** extracts text per page into a plain `.docx`. It does not
  preserve layout, images, or complex formatting — good for grabbing text
  out of a PDF, not for round-tripping a designed document.
- **Word → PDF** renders the document's HTML to an image-based PDF
  (via `html2canvas`), so text isn't selectable in the output. Good enough
  for sharing/printing, not for a publisher-grade PDF.
- **PDF compress** re-rasterizes each page as a JPEG at a chosen quality.
  Great for scanned/image-heavy PDFs, a poor choice for text-only PDFs
  (text becomes an image). A warning is shown in the UI.
- **Audio/video** run on `ffmpeg.wasm`, which is single-threaded in this
  build and noticeably slower than native `ffmpeg`. Fine for short clips;
  expect a multi-minute wait on large video files. It's also a ~25 MB
  download the first time you use any audio/video tool (lazy-loaded, not
  loaded on first page view).
- **Background removal** (images) is listed on the roadmap, not built —
  it needs a segmentation model (e.g. `@imgly/background-removal` or
  `MediaPipe`), which is a good "month two" addition.

None of this is hidden from the user — the UI shows a short note on any
tool with a caveat like this.
