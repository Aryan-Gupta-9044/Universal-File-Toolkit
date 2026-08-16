/**
 * PDF tools — merge / split / compress.
 * Uses pdf-lib for building/editing PDFs and pdf.js for rasterizing pages
 * (needed for the compress tool, which re-encodes pages as JPEG).
 */
const PdfTool = (() => {
  const PDF_TYPE = ["application/pdf"];

  async function fileToPdfDoc(file) {
    const bytes = await file.arrayBuffer();
    return PDFLib.PDFDocument.load(bytes);
  }

  // ---------------------------------------------------------- merge

  const mergeTool = {
    label: "Merge",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { files: [] };
      const list = UI.el("ul", { class: "file-list" });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();

      function renderList() {
        list.innerHTML = "";
        state.files.forEach((f, i) => {
          list.appendChild(UI.el("li", {}, [
            UI.el("span", {}, `${i + 1}. ${f.name}`),
            UI.el("span", { class: "row" }, [
              i > 0 ? UI.el("span", { class: "rm", style: "color:var(--text-dim)", onclick: () => { [state.files[i-1], state.files[i]] = [state.files[i], state.files[i-1]]; renderList(); } }, "↑") : "",
              UI.el("span", { class: "rm", onclick: () => { state.files.splice(i, 1); renderList(); } }, "remove"),
            ]),
          ]));
        });
      }

      const dropZone = UI.fileDropMini(PDF_TYPE, true, (files) => {
        state.files.push(...files);
        renderList();
      });

      const runBtn = UI.el("button", { class: "btn" }, "Merge PDFs");
      runBtn.onclick = async () => {
        if (state.files.length < 2) {
          results.innerHTML = "";
          results.appendChild(UI.el("div", { class: "note warn" }, "Add at least two PDFs to merge."));
          return;
        }
        UI.setProgress(progress, true);
        results.innerHTML = "";
        try {
          const merged = await PDFLib.PDFDocument.create();
          for (const file of state.files) {
            const src = await fileToPdfDoc(file);
            const pages = await merged.copyPages(src, src.getPageIndices());
            pages.forEach((p) => merged.addPage(p));
          }
          const bytes = await merged.save();
          results.appendChild(UI.resultItem("merged.pdf", new Blob([bytes], { type: "application/pdf" })));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Merge failed: ${e.message}`));
        }
        UI.setProgress(progress, false);
      };

      container.append(dropZone, list, runBtn, progress, results);
      if (initialFiles && initialFiles.length) { state.files.push(...initialFiles); renderList(); }
    },
  };

  // ---------------------------------------------------------- split

  const splitTool = {
    label: "Split",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { file: null, pageCount: 0 };
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const mode = UI.el("select", {}, [
        UI.el("option", { value: "all" }, "Every page as its own PDF (zipped)"),
        UI.el("option", { value: "range" }, "Extract a page range"),
      ]);
      const rangeInput = UI.el("input", { type: "text", placeholder: "e.g. 1-3, 5" });
      const rangeField = UI.el("div", { class: "field", style: "display:none" }, [
        UI.el("label", {}, "Pages"), rangeInput,
      ]);
      mode.onchange = () => { rangeField.style.display = mode.value === "range" ? "block" : "none"; };

      const dropZone = UI.fileDropMini(PDF_TYPE, false, async (files) => {
        state.file = files[0];
        const doc = await fileToPdfDoc(state.file);
        state.pageCount = doc.getPageCount();
        info.textContent = `Loaded: ${state.file.name} — ${state.pageCount} page(s)`;
      });

      function parseRanges(str, max) {
        const out = new Set();
        str.split(",").forEach((chunk) => {
          chunk = chunk.trim();
          if (!chunk) return;
          const m = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
          if (m) {
            for (let i = parseInt(m[1]); i <= parseInt(m[2]); i++) if (i >= 1 && i <= max) out.add(i - 1);
          } else if (/^\d+$/.test(chunk)) {
            const n = parseInt(chunk);
            if (n >= 1 && n <= max) out.add(n - 1);
          }
        });
        return [...out].sort((a, b) => a - b);
      }

      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Split");
      runBtn.onclick = async () => {
        if (!state.file) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        try {
          const src = await fileToPdfDoc(state.file);
          if (mode.value === "all") {
            const zip = new JSZip();
            for (let i = 0; i < state.pageCount; i++) {
              const doc = await PDFLib.PDFDocument.create();
              const [p] = await doc.copyPages(src, [i]);
              doc.addPage(p);
              const bytes = await doc.save();
              zip.file(`page-${String(i + 1).padStart(2, "0")}.pdf`, bytes);
            }
            const blob = await zip.generateAsync({ type: "blob" });
            results.appendChild(UI.resultItem("split-pages.zip", blob));
          } else {
            const indices = parseRanges(rangeInput.value, state.pageCount);
            if (!indices.length) {
              results.appendChild(UI.el("div", { class: "note warn" }, "Enter a valid page range, e.g. 1-3, 5"));
            } else {
              const doc = await PDFLib.PDFDocument.create();
              const pages = await doc.copyPages(src, indices);
              pages.forEach((p) => doc.addPage(p));
              const bytes = await doc.save();
              results.appendChild(UI.resultItem("extracted.pdf", new Blob([bytes], { type: "application/pdf" })));
            }
          }
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Split failed: ${e.message}`));
        }
        UI.setProgress(progress, false);
      };

      container.append(dropZone, info,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "Mode"), mode]),
        rangeField, runBtn, progress, results
      );
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  // ---------------------------------------------------------- compress

  const compressTool = {
    label: "Compress",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { file: null };
      const quality = UI.el("input", { type: "range", min: "0.3", max: "0.9", step: "0.05", value: "0.6" });
      const qLabel = UI.el("span", { class: "hint" }, "0.60");
      quality.oninput = () => (qLabel.textContent = parseFloat(quality.value).toFixed(2));

      const note = UI.el("div", { class: "note warn" },
        "This re-renders every page as a JPEG image, then rebuilds the PDF. " +
        "Great for scanned/image-heavy PDFs; text-only PDFs will lose selectable text."
      );

      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(PDF_TYPE, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name} (${UI.formatBytes(state.file.size)})`;
      });

      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Compress");
      runBtn.onclick = async () => {
        if (!state.file || !window.pdfjsLib) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        try {
          const bytes = await state.file.arrayBuffer();
          const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
          const out = await PDFLib.PDFDocument.create();

          for (let i = 1; i <= pdfjsDoc.numPages; i++) {
            const page = await pdfjsDoc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
            const jpegDataUrl = canvas.toDataURL("image/jpeg", parseFloat(quality.value));
            const jpegBytes = Uint8Array.from(atob(jpegDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
            const img = await out.embedJpg(jpegBytes);
            const pageDoc = out.addPage([viewport.width, viewport.height]);
            pageDoc.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
          }

          const outBytes = await out.save();
          const blob = new Blob([outBytes], { type: "application/pdf" });
          const savedPct = Math.max(0, Math.round(100 - (blob.size / state.file.size) * 100));
          results.appendChild(UI.resultItem(
            `${state.file.name.replace(/\.pdf$/i, "")}-compressed.pdf`, blob,
            `${UI.formatBytes(blob.size)} (${savedPct}% smaller)`
          ));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Compress failed: ${e.message}`));
        }
        UI.setProgress(progress, false);
      };

      container.append(note, dropZone, info,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "JPEG quality per page"), quality, qLabel]),
        runBtn, progress, results
      );
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  return {
    accepts: PDF_TYPE,
    tools: { merge: mergeTool, split: splitTool, compress: compressTool },
  };
})();
