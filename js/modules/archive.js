/**
 * Archive tools — zip a set of files, or extract a .zip's contents.
 */
const ArchiveTool = (() => {
  const ZIP_TYPE = ["application/zip", "application/x-zip-compressed"];

  const zipTool = {
    label: "Create ZIP",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { files: [] };
      const list = UI.el("ul", { class: "file-list" });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const nameInput = UI.el("input", { type: "text", value: "archive.zip" });

      function renderList() {
        list.innerHTML = "";
        state.files.forEach((f, i) => {
          list.appendChild(UI.el("li", {}, [
            UI.el("span", {}, `${f.name} (${UI.formatBytes(f.size)})`),
            UI.el("span", { class: "rm", onclick: () => { state.files.splice(i, 1); renderList(); } }, "remove"),
          ]));
        });
      }

      const dropZone = UI.fileDropMini(null, true, (files) => {
        state.files.push(...files);
        renderList();
      });

      const runBtn = UI.el("button", { class: "btn" }, "Create ZIP");
      runBtn.onclick = async () => {
        if (!state.files.length) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        const zip = new JSZip();
        for (const f of state.files) zip.file(f.name, await f.arrayBuffer());
        const blob = await zip.generateAsync({ type: "blob" });
        const filename = nameInput.value.trim() || "archive.zip";
        results.appendChild(UI.resultItem(filename.endsWith(".zip") ? filename : `${filename}.zip`, blob));
        UI.setProgress(progress, false);
      };

      container.append(
        dropZone, list,
        UI.el("div", { class: "field" }, [UI.el("label", {}, "Archive name"), nameInput]),
        runBtn, progress, results
      );
      if (initialFiles && initialFiles.length) { state.files.push(...initialFiles); renderList(); }
    },
  };

  const extractTool = {
    label: "Extract ZIP",
    render(container, initialFiles) {
      container.innerHTML = "";
      const state = { zip: null, name: "" };
      const info = UI.el("div", { class: "note" }, "No archive loaded yet.");
      const entryList = UI.el("div", { class: "results" });
      const progress = UI.progressEl();

      const dropZone = UI.fileDropMini(ZIP_TYPE, false, async (files) => {
        const file = files[0];
        state.name = file.name;
        UI.setProgress(progress, true);
        entryList.innerHTML = "";
        try {
          const zip = await JSZip.loadAsync(file);
          state.zip = zip;
          const entries = Object.values(zip.files).filter((e) => !e.dir);
          info.textContent = `${file.name} — ${entries.length} file(s)`;

          if (entries.length > 1) {
            const dlAll = UI.el("button", { class: "btn secondary" }, "Download all as ZIP (re-packed)");
            dlAll.onclick = () => UI.downloadBlob(file, file.name);
            entryList.appendChild(dlAll);
          }

          for (const entry of entries) {
            const row = UI.el("div", { class: "result-item" }, [
              UI.el("span", { class: "meta" }, entry.name),
              UI.el("button", { class: "btn secondary", style: "padding:5px 10px" }, "Download"),
            ]);
            row.querySelector("button").onclick = async () => {
              const blob = await entry.async("blob");
              UI.downloadBlob(blob, entry.name.split("/").pop());
            };
            entryList.appendChild(row);
          }
        } catch (e) {
          entryList.appendChild(UI.el("div", { class: "note warn" }, `Couldn't read archive: ${e.message}`));
        }
        UI.setProgress(progress, false);
      });

      container.append(dropZone, info, progress, entryList);
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  return {
    accepts: ZIP_TYPE,
    tools: { zip: zipTool, extract: extractTool },
  };
})();
