# Roadmap

This is deliberately scoped so there's real work left — use it as a backlog.

## Near-term (solidify what exists)
- [ ] PDF → Word: preserve basic paragraph breaks/headings instead of one
      text blob per page (detect font size jumps from pdf.js text items).
- [ ] Image crop: add aspect-ratio presets (1:1, 4:3, 16:9) and a numeric
      x/y/w/h entry for precision.
- [ ] Video: show a progress percentage during ffmpeg.wasm runs (it exposes
      a `progress` event — currently only a spinner is shown).
- [ ] Persist "recent files" in IndexedDB so a refresh doesn't lose work.
- [ ] Drag-reorder pages before PDF merge/split.

## Medium-term (new capability)
- [ ] Background removal for images — `@imgly/background-removal` (WASM,
      no server) is the natural fit given the rest of the stack.
- [ ] Batch mode: run one tool over many files at once, zip the results.
- [ ] OCR for scanned PDFs (`tesseract.js`) feeding into PDF → Word.
- [ ] Audio waveform preview + visual trim handles (currently numeric
      start/end fields).
- [ ] EXIF viewer/stripper for images (privacy-useful, easy win).

## Longer-term / stretch
- [ ] Multi-threaded ffmpeg.wasm build (needs COOP/COEP headers — requires
      moving off pure static hosting or configuring headers on the host).
- [ ] PWA + offline install (service worker caches the CDN libs).
- [ ] Optional local-only "workspace" that remembers your last N outputs
      across sessions.
- [ ] Plugin system: a station is just a config object + a module with a
      known function shape — document that contract so others can add
      tools without touching `app.js`.

## Design tokens (for re-skinning)

Theme concept: a **workshop/pegboard**. Tool stations "power on" (glow)
when a compatible file is dropped on the workbench surface — that's the
one signature interaction; everything else stays quiet and functional.

```
--bg:           #12161D   (base)
--panel:        #1A2029   (station cards)
--panel-raised: #202834   (open tool panel)
--line:         #2B3542   (hairlines, dashed pegboard borders)
--text:         #E7EBF1
--text-dim:     #8A94A3
--amber:        #E8A33D   (primary accent / "powered on" glow)
--teal:         #4FB8AC   (success)
--red:          #E1594C   (error/danger)

Display/label face: "JetBrains Mono"  (station codes, buttons, data)
Body face:           "Inter"          (descriptions, help text)
```

Station codes (`DOC-01`, `IMG-02`, `AUD-03`, `VID-04`, `ZIP-05`) are real
routing labels, not decoration — they're what the drop-zone status line
prints when it identifies a file type, so keep them if you extend the set.
