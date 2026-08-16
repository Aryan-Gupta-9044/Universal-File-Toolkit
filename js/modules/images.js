/**
 * Image tools — convert / resize / compress / crop.
 * Everything runs on the Canvas API; no external library needed.
 *
 * Module contract: window.ImagesTool.tools is a map of
 *   { [toolId]: { label, render(container, initialFiles) } }
 * `render` is called with a fresh <div> container each time the tab opens.
 */
const ImagesTool = (() => {
  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => resolve({ img, url });
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = url;
    });
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  }

  function extFor(mime) {
    return { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mime] || "img";
  }

  function baseName(name) {
    return name.replace(/\.[^.]+$/, "");
  }

  // ---------------------------------------------------------- convert

  const convertTool = {
    label: "Convert",
    render(container, initialFiles) {
      container.innerHTML = "";
      const format = UI.el("select", {}, [
        UI.el("option", { value: "image/png" }, "PNG"),
        UI.el("option", { value: "image/jpeg" }, "JPG"),
        UI.el("option", { value: "image/webp" }, "WEBP"),
      ]);
      const quality = UI.el("input", { type: "range", min: "0.3", max: "1", step: "0.05", value: "0.85" });
      const qualityWrap = UI.el("div", { class: "field" }, [
        UI.el("label", {}, "Quality (JPG / WEBP only)"),
        quality,
      ]);

      const state = { files: [] };
      const dropZone = UI.fileDropMini(IMAGE_TYPES, true, (files) => {
        state.files = files;
        renderFileList();
      });

      const list = UI.el("ul", { class: "file-list" });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Convert");

      function renderFileList() {
        list.innerHTML = "";
        state.files.forEach((f, i) => {
          list.appendChild(UI.el("li", {}, [
            UI.el("span", {}, `${f.name} (${UI.formatBytes(f.size)})`),
            UI.el("span", { class: "rm", onclick: () => { state.files.splice(i, 1); renderFileList(); } }, "remove"),
          ]));
        });
      }

      runBtn.onclick = async () => {
        if (!state.files.length) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        for (const file of state.files) {
          try {
            const { img, url } = await loadImage(file);
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (format.value === "image/jpeg") {
              // JPG has no alpha channel — flatten onto white first.
              ctx.fillStyle = "#fff";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            const blob = await canvasToBlob(canvas, format.value, parseFloat(quality.value));
            const outName = `${baseName(file.name)}.${extFor(format.value)}`;
            results.appendChild(UI.resultItem(outName, blob));
          } catch (e) {
            results.appendChild(UI.el("div", { class: "note warn" }, `${file.name}: ${e.message}`));
          }
        }
        UI.setProgress(progress, false);
      };

      container.append(
        dropZone, list,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "Output format"), format]),
        qualityWrap,
        runBtn, progress, results
      );
      if (initialFiles && initialFiles.length) { state.files = initialFiles; renderFileList(); }
    },
  };

  // ---------------------------------------------------------- resize

  const resizeTool = {
    label: "Resize",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { file: null, ratio: 1 };
      const width = UI.el("input", { type: "number", placeholder: "width (px)" });
      const height = UI.el("input", { type: "number", placeholder: "height (px)" });
      const lock = UI.el("input", { type: "checkbox", checked: true });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();

      width.oninput = () => { if (lock.checked && state.ratio) height.value = Math.round(width.value / state.ratio); };
      height.oninput = () => { if (lock.checked && state.ratio) width.value = Math.round(height.value * state.ratio); };

      const dropZone = UI.fileDropMini(IMAGE_TYPES, false, async (files) => {
        state.file = files[0];
        const { img, url } = await loadImage(state.file);
        state.ratio = img.naturalWidth / img.naturalHeight;
        width.value = img.naturalWidth;
        height.value = img.naturalHeight;
        URL.revokeObjectURL(url);
        info.textContent = `Loaded: ${state.file.name} — original ${img.naturalWidth}×${img.naturalHeight}`;
      });
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");

      const runBtn = UI.el("button", { class: "btn" }, "Resize");
      runBtn.onclick = async () => {
        if (!state.file || !width.value || !height.value) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        const { img, url } = await loadImage(state.file);
        const canvas = document.createElement("canvas");
        canvas.width = parseInt(width.value, 10);
        canvas.height = parseInt(height.value, 10);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const mime = state.file.type && IMAGE_TYPES.includes(state.file.type) ? state.file.type : "image/png";
        const blob = await canvasToBlob(canvas, mime, 0.92);
        results.appendChild(UI.resultItem(`${baseName(state.file.name)}-${canvas.width}x${canvas.height}.${extFor(mime)}`, blob));
        UI.setProgress(progress, false);
      };

      container.append(
        dropZone, info,
        UI.el("div", { class: "row" }, [
          UI.el("div", { class: "field", style: "flex:1" }, [UI.el("label", {}, "Width"), width]),
          UI.el("div", { class: "field", style: "flex:1" }, [UI.el("label", {}, "Height"), height]),
        ]),
        UI.el("label", { class: "row", style: "font-size:12.5px;color:var(--text-dim)" }, [lock, "Lock aspect ratio"]),
        runBtn, progress, results
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
      const quality = UI.el("input", { type: "range", min: "0.2", max: "0.95", step: "0.05", value: "0.7" });
      const qLabel = UI.el("span", { class: "hint" }, "0.70");
      quality.oninput = () => (qLabel.textContent = parseFloat(quality.value).toFixed(2));

      const note = UI.el("div", { class: "note" },
        "PNGs are re-encoded losslessly by the browser, so quality won't shrink them much. " +
        "For real savings on a PNG, this tool outputs WEBP instead."
      );

      const dropZone = UI.fileDropMini(IMAGE_TYPES, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name} (${UI.formatBytes(state.file.size)})`;
      });
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();

      const runBtn = UI.el("button", { class: "btn" }, "Compress");
      runBtn.onclick = async () => {
        if (!state.file) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        const { img, url } = await loadImage(state.file);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const outMime = state.file.type === "image/png" ? "image/webp" : state.file.type;
        const ctx = canvas.getContext("2d");
        if (outMime === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        const blob = await canvasToBlob(canvas, outMime, parseFloat(quality.value));
        const savedPct = Math.max(0, Math.round(100 - (blob.size / state.file.size) * 100));
        results.appendChild(UI.resultItem(
          `${baseName(state.file.name)}-compressed.${extFor(outMime)}`, blob,
          `${UI.formatBytes(blob.size)} (${savedPct}% smaller)`
        ));
        UI.setProgress(progress, false);
      };

      container.append(dropZone, info, note,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "Quality"), quality, qLabel]),
        runBtn, progress, results
      );
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  // ---------------------------------------------------------- crop

  const cropTool = {
    label: "Crop",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { file: null, img: null, box: { x: 20, y: 20, w: 100, h: 100 }, scale: 1 };
      const results = UI.el("div", { class: "results" });
      const wrap = UI.el("div", { class: "preview-canvas-wrap" });
      const canvas = UI.el("canvas");
      const boxEl = UI.el("div", { class: "crop-box" }, [UI.el("div", { class: "handle" })]);

      function paintBox() {
        boxEl.style.left = state.box.x + "px";
        boxEl.style.top = state.box.y + "px";
        boxEl.style.width = state.box.w + "px";
        boxEl.style.height = state.box.h + "px";
      }

      function wireDrag() {
        let dragging = null, start = null;
        boxEl.addEventListener("mousedown", (e) => {
          if (e.target.classList.contains("handle")) { dragging = "resize"; }
          else { dragging = "move"; }
          start = { x: e.clientX, y: e.clientY, box: { ...state.box } };
          e.preventDefault();
        });
        window.addEventListener("mousemove", (e) => {
          if (!dragging) return;
          const dx = e.clientX - start.x, dy = e.clientY - start.y;
          if (dragging === "move") {
            state.box.x = Math.max(0, Math.min(canvas.width - state.box.w, start.box.x + dx));
            state.box.y = Math.max(0, Math.min(canvas.height - state.box.h, start.box.y + dy));
          } else {
            state.box.w = Math.max(20, Math.min(canvas.width - state.box.x, start.box.w + dx));
            state.box.h = Math.max(20, Math.min(canvas.height - state.box.y, start.box.h + dy));
          }
          paintBox();
        });
        window.addEventListener("mouseup", () => (dragging = null));
      }
      wireDrag();

      const dropZone = UI.fileDropMini(IMAGE_TYPES, false, async (files) => {
        state.file = files[0];
        const { img, url } = await loadImage(state.file);
        state.img = img;
        const maxW = 480;
        state.scale = Math.min(1, maxW / img.naturalWidth);
        canvas.width = img.naturalWidth * state.scale;
        canvas.height = img.naturalHeight * state.scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        state.box = { x: canvas.width * 0.15, y: canvas.height * 0.15, w: canvas.width * 0.7, h: canvas.height * 0.7 };
        paintBox();
        wrap.style.display = "inline-block";
      });

      wrap.append(canvas, boxEl);
      wrap.style.display = "none";
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Crop & Download");
      runBtn.onclick = async () => {
        if (!state.img) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        const out = document.createElement("canvas");
        const sx = state.box.x / state.scale, sy = state.box.y / state.scale;
        const sw = state.box.w / state.scale, sh = state.box.h / state.scale;
        out.width = sw; out.height = sh;
        out.getContext("2d").drawImage(state.img, sx, sy, sw, sh, 0, 0, sw, sh);
        const mime = state.file.type && IMAGE_TYPES.includes(state.file.type) ? state.file.type : "image/png";
        const blob = await canvasToBlob(out, mime, 0.92);
        results.appendChild(UI.resultItem(`${baseName(state.file.name)}-cropped.${extFor(mime)}`, blob));
        UI.setProgress(progress, false);
      };

      container.append(
        dropZone,
        UI.el("div", { class: "hint" }, "Drag the box to move it, drag the corner handle to resize."),
        wrap, runBtn, progress, results
      );
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  return {
    accepts: IMAGE_TYPES,
    tools: { convert: convertTool, resize: resizeTool, compress: compressTool, crop: cropTool },
  };
})();
