/**
 * Audio tools — convert / trim / compress, via ffmpeg.wasm.
 * The ffmpeg core (~25MB) is only fetched the first time one of these
 * tools actually runs (see js/lib-loader.js).
 */
const AudioTool = (() => {
  const AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac", "audio/ogg"];

  function extOf(name) {
    return (name.split(".").pop() || "").toLowerCase();
  }

  async function runFfmpeg(file, args, outName, onLog) {
    const ff = await LibLoader.ffmpeg(onLog);
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
      "First run downloads the ffmpeg engine (~25MB) into your browser — a one-time cost per tab. " +
      "Processing itself happens locally and can take a while on longer files."
    );
  }

  // ---------------------------------------------------------- convert

  const convertTool = {
    label: "Convert",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { file: null };
      const format = UI.el("select", {}, [
        UI.el("option", { value: "mp3" }, "MP3"),
        UI.el("option", { value: "wav" }, "WAV"),
      ]);
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(AUDIO_TYPES, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name}`;
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
          const args = format.value === "mp3"
            ? ["-i", "__IN__", "-codec:a", "libmp3lame", "-qscale:a", "2", "__OUT__"]
            : ["-i", "__IN__", "__OUT__"];
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

  // ---------------------------------------------------------- trim

  const trimTool = {
    label: "Trim",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { file: null };
      const start = UI.el("input", { type: "text", placeholder: "00:00:00" });
      const end = UI.el("input", { type: "text", placeholder: "00:00:30" });
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(AUDIO_TYPES, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name}`;
      });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Trim");

      runBtn.onclick = async () => {
        if (!state.file || !start.value || !end.value) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        try {
          const ext = extOf(state.file.name) || "mp3";
          const outName = `out.${ext}`;
          const args = ["-i", "__IN__", "-ss", start.value, "-to", end.value, "-c", "copy", "__OUT__"];
          const blob = await runFfmpeg(state.file, args, outName);
          results.appendChild(UI.resultItem(`${state.file.name.replace(/\.[^.]+$/, "")}-trimmed.${ext}`, blob));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Trim failed: ${e.message} (try times within the clip's length)`));
        }
        UI.setProgress(progress, false);
      };

      container.append(ffmpegNote(), dropZone, info,
        UI.el("div", { class: "row" }, [
          UI.el("div", { class: "field", style: "flex:1" }, [UI.el("label", {}, "Start (hh:mm:ss)"), start]),
          UI.el("div", { class: "field", style: "flex:1" }, [UI.el("label", {}, "End (hh:mm:ss)"), end]),
        ]),
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
      const bitrate = UI.el("select", {}, [
        UI.el("option", { value: "64k" }, "64 kbps (small, voice-ok)"),
        UI.el("option", { value: "96k" }, "96 kbps"),
        UI.el("option", { value: "128k", selected: true }, "128 kbps (default)"),
        UI.el("option", { value: "192k" }, "192 kbps (higher quality)"),
      ]);
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(AUDIO_TYPES, false, (files) => {
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
          const outName = "out.mp3";
          const args = ["-i", "__IN__", "-codec:a", "libmp3lame", "-b:a", bitrate.value, "__OUT__"];
          const blob = await runFfmpeg(state.file, args, outName);
          const savedPct = Math.max(0, Math.round(100 - (blob.size / state.file.size) * 100));
          results.appendChild(UI.resultItem(
            `${state.file.name.replace(/\.[^.]+$/, "")}-compressed.mp3`, blob,
            `${UI.formatBytes(blob.size)} (${savedPct}% smaller)`
          ));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Compress failed: ${e.message}`));
        }
        UI.setProgress(progress, false);
      };

      container.append(ffmpegNote(), dropZone, info,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "Target bitrate"), bitrate]),
        runBtn, progress, results
      );
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  return {
    accepts: AUDIO_TYPES,
    tools: { convert: convertTool, trim: trimTool, compress: compressTool },
  };
})();
