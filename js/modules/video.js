/**
 * Video tools — convert / compress / resize, via ffmpeg.wasm.
 * Same engine as audio.js; see js/lib-loader.js for the lazy-load.
 * ffmpeg.wasm 0.11 is single-threaded, so expect real wait times on
 * anything more than a short clip.
 */
const VideoTool = (() => {
  const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];

  function extOf(name) {
    return (name.split(".").pop() || "").toLowerCase();
  }

  async function runFfmpeg(file, args, outName) {
    const ff = await LibLoader.ffmpeg();
    const { fetchFile } = window.FFmpeg;
    const inName = "in." + extOf(file.name || "input");
    ff.FS("writeFile", inName, await fetchFile(file));
    await ff.run(...args.map((a) => (a === "__IN__" ? inName : a === "__OUT__" ? outName : a)));
    const data = ff.FS("readFile", outName);
    ff.FS("unlink", inName);
    ff.FS("unlink", outName);
    return new Blob([data.buffer], { type: "application/octet-stream" });
  }

  function ffmpegNote() {
    return UI.el("div", { class: "note" },
      "First run downloads the ffmpeg engine (~25MB) — a one-time cost per tab. " +
      "Video processing is CPU-heavy in WebAssembly; large or long files can take minutes."
    );
  }

  // ---------------------------------------------------------- convert

  const convertTool = {
    label: "Convert",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { file: null };
      const format = UI.el("select", {}, [
        UI.el("option", { value: "mp4" }, "MP4"),
        UI.el("option", { value: "avi" }, "AVI"),
        UI.el("option", { value: "mov" }, "MOV"),
      ]);
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(VIDEO_TYPES, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name} (${UI.formatBytes(state.file.size)})`;
      });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Convert");

      runBtn.onclick = async () => {
        if (!state.file) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        try {
          const outName = `out.${format.value}`;
          const codecArgs = format.value === "avi"
            ? ["-c:v", "mpeg4", "-c:a", "libmp3lame"]
            : ["-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac"];
          const args = ["-i", "__IN__", ...codecArgs, "__OUT__"];
          const blob = await runFfmpeg(state.file, args, outName);
          results.appendChild(UI.resultItem(`${state.file.name.replace(/\.[^.]+$/, "")}.${format.value}`, blob));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Conversion failed: ${e.message}`));
        }
        UI.setProgress(progress, false);
      };

      container.append(ffmpegNote(), dropZone, info,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "Convert to"), format]),
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
      const crf = UI.el("select", {}, [
        UI.el("option", { value: "28" }, "Smaller file (lower quality)"),
        UI.el("option", { value: "23", selected: true }, "Balanced (default)"),
        UI.el("option", { value: "18" }, "Higher quality (larger file)"),
      ]);
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(VIDEO_TYPES, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name} (${UI.formatBytes(state.file.size)})`;
      });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Compress");

      runBtn.onclick = async () => {
        if (!state.file) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        try {
          const outName = "out.mp4";
          const args = ["-i", "__IN__", "-c:v", "libx264", "-preset", "ultrafast", "-crf", crf.value, "-c:a", "aac", "-b:a", "128k", "__OUT__"];
          const blob = await runFfmpeg(state.file, args, outName);
          const savedPct = Math.max(0, Math.round(100 - (blob.size / state.file.size) * 100));
          results.appendChild(UI.resultItem(
            `${state.file.name.replace(/\.[^.]+$/, "")}-compressed.mp4`, blob,
            `${UI.formatBytes(blob.size)} (${savedPct}% smaller)`
          ));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Compress failed: ${e.message}`));
        }
        UI.setProgress(progress, false);
      };

      container.append(ffmpegNote(), dropZone, info,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "Target"), crf]),
        runBtn, progress, results
      );
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  // ---------------------------------------------------------- resize

  const resizeTool = {
    label: "Resize",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { file: null };
      const preset = UI.el("select", {}, [
        UI.el("option", { value: "1280:-2" }, "720p wide"),
        UI.el("option", { value: "854:-2" }, "480p"),
        UI.el("option", { value: "640:-2" }, "360p"),
      ]);
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(VIDEO_TYPES, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name}`;
      });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Resize");

      runBtn.onclick = async () => {
        if (!state.file) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        try {
          const outName = "out.mp4";
          const args = ["-i", "__IN__", "-vf", `scale=${preset.value}`, "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "copy", "__OUT__"];
          const blob = await runFfmpeg(state.file, args, outName);
          results.appendChild(UI.resultItem(`${state.file.name.replace(/\.[^.]+$/, "")}-resized.mp4`, blob));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Resize failed: ${e.message}`));
        }
        UI.setProgress(progress, false);
      };

      container.append(ffmpegNote(), dropZone, info,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "Resolution"), preset]),
        runBtn, progress, results
      );
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  return {
    accepts: VIDEO_TYPES,
    tools: { convert: convertTool, compress: compressTool, resize: resizeTool },
  };
})();
