/**
 * App shell.
 *
 * - `UI` is a small DOM helper namespace shared by every tool module
 *   (element builder, drop zones, progress bar, result rows, downloads).
 * - `STATIONS` is the single place that wires categories to their tools —
 *   add a new tool by adding one entry to a station's `tools` map.
 * - The rest wires up the workbench drop zone and the accordion stations.
 */

// ============================================================ UI helpers

const UI = (() => {
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k.startsWith("on") && typeof v === "function") node[k] = v;
      else if (k === "style") node.style.cssText = v;
      else if (v === true) node.setAttribute(k, "");
      else node.setAttribute(k, v);
    });
    const kids = Array.isArray(children) ? children : children == null ? [] : [children];
    kids.forEach((c) => {
      if (c === null || c === undefined || c === "") return;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return node;
  }

  function formatBytes(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
  }

  function downloadBlob(blob, filename) {
    if (window.saveAs) return window.saveAs(blob, filename);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function fileDropMini(acceptTypes, multiple, onFiles) {
    const input = el("input", { type: "file", style: "display:none", multiple: !!multiple });
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => {
      if (input.files.length) onFiles(Array.from(input.files));
    });
    const zone = el(
      "div",
      { class: "file-drop-mini", tabindex: "0" },
      multiple ? "Click or drop files here (multiple allowed)" : "Click or drop a file here"
    );
    zone.appendChild(input);
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.style.borderColor = "var(--amber)"; });
    zone.addEventListener("dragleave", () => (zone.style.borderColor = ""));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.style.borderColor = "";
      if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
    });
    zone.dispatchDrop = (files) => onFiles(files);
    return zone;
  }

  function progressEl() {
    return el("div", { class: "progress" }, [el("div", { class: "progress-bar" })]);
  }

  function setProgress(progressNode, active) {
    progressNode.classList.toggle("active", active);
  }

  function resultItem(filename, blob, metaExtra) {
    const meta = el("span", { class: "meta" }, [
      el("strong", {}, filename),
      metaExtra ? ` — ${metaExtra}` : ` — ${formatBytes(blob.size)}`,
    ]);
    const btn = el("button", { class: "btn secondary" }, "Download");
    btn.onclick = () => downloadBlob(blob, filename);
    return el("div", { class: "result-item" }, [meta, btn]);
  }

  return { el, formatBytes, downloadBlob, fileDropMini, progressEl, setProgress, resultItem };
})();

// ============================================================ Stations config

const EXT_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg",
  mp4: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo", webm: "video/webm",
  zip: "application/zip",
};

function guessMime(file) {
  if (file.type) return file.type;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return EXT_MIME[ext] || "";
}

const STATIONS = [
  {
    id: "doc", code: "DOC-01", icon: "📄", title: "Documents",
    accepts: [...PdfTool.accepts, ...DocsTool.accepts],
    tools: {
      pdfToWord: DocsTool.tools.pdfToWord,
      wordToPdf: DocsTool.tools.wordToPdf,
      merge: PdfTool.tools.merge,
      split: PdfTool.tools.split,
      compress: PdfTool.tools.compress,
    },
  },
  {
    id: "img", code: "IMG-02", icon: "🖼", title: "Images",
    accepts: ImagesTool.accepts,
    tools: ImagesTool.tools,
  },
  {
    id: "aud", code: "AUD-03", icon: "🎵", title: "Audio",
    accepts: AudioTool.accepts,
    tools: AudioTool.tools,
  },
  {
    id: "vid", code: "VID-04", icon: "🎥", title: "Video",
    accepts: VideoTool.accepts,
    tools: VideoTool.tools,
  },
  {
    id: "zip", code: "ZIP-05", icon: "🗜", title: "Archives",
    accepts: ArchiveTool.accepts,
    tools: ArchiveTool.tools,
  },
];

// ============================================================ Render stations

function buildStation(station) {
  const card = UI.el("div", { class: "station", id: `station-${station.id}` });
  const chevron = UI.el("span", { class: "station-chevron" }, "▸");
  const head = UI.el("div", { class: "station-head" }, [
    UI.el("span", { class: "station-code" }, station.code),
    UI.el("span", { class: "station-icon" }, station.icon),
    UI.el("span", { class: "station-title" }, station.title),
    chevron,
  ]);

  const tabsWrap = UI.el("div", { class: "tool-tabs" });
  const panel = UI.el("div", { class: "tool-panel" });
  const body = UI.el("div", { class: "station-body" }, [tabsWrap, panel]);

  const toolKeys = Object.keys(station.tools);
  let activeKey = toolKeys[0];

  function renderTabs(initialFilesByTool) {
    tabsWrap.innerHTML = "";
    toolKeys.forEach((key) => {
      const tab = UI.el("button", { class: "tool-tab" + (key === activeKey ? " active" : "") }, station.tools[key].label);
      tab.onclick = () => {
        activeKey = key;
        renderTabs();
        station.tools[key].render(panel, (initialFilesByTool && initialFilesByTool[key]) || []);
      };
      tabsWrap.appendChild(tab);
    });
  }

  head.addEventListener("click", () => {
    const wasOpen = card.classList.contains("open");
    card.classList.toggle("open", !wasOpen);
    if (!wasOpen && panel.innerHTML === "") {
      renderTabs();
      station.tools[activeKey].render(panel, []);
    }
  });

  card.append(head, body);
  card._openWithFiles = (files) => {
    card.classList.add("open");
    // Pick the first tool as the landing tab, preload matching files there.
    activeKey = toolKeys[0];
    renderTabs({ [activeKey]: files });
    station.tools[activeKey].render(panel, files);
  };
  return card;
}

const stationCards = {};
STATIONS.forEach((s) => {
  const card = buildStation(s);
  stationCards[s.id] = card;
  document.getElementById("stations").appendChild(card);
});

// ============================================================ Workbench drop zone

const workbench = document.getElementById("workbench");
const wbInput = document.getElementById("wb-file-input");
const wbStatus = document.getElementById("wb-status");
wbInput.multiple = true;

function handleIncomingFiles(files) {
  if (!files.length) return;
  STATIONS.forEach((s) => stationCards[s.id].classList.remove("powered"));

  const matches = [];
  files.forEach((file) => {
    const mime = guessMime(file);
    STATIONS.forEach((s) => {
      if (s.accepts.includes(mime)) matches.push({ station: s, file });
    });
  });

  if (!matches.length) {
    wbStatus.textContent = `Unrecognized file type — pick a tool manually below.`;
    wbStatus.classList.add("err");
    return;
  }
  wbStatus.classList.remove("err");

  const byStation = {};
  matches.forEach(({ station, file }) => {
    (byStation[station.id] = byStation[station.id] || { station, files: [] }).files.push(file);
  });

  const names = files.map((f) => f.name).join(", ");
  const stationNames = Object.values(byStation).map((b) => b.station.title).join(", ");
  wbStatus.textContent = `Loaded ${names} — lit up: ${stationNames}`;

  Object.values(byStation).forEach(({ station, files: matchedFiles }) => {
    stationCards[station.id].classList.add("powered");
  });

  // Auto-open the first matching station with its files preloaded.
  const first = Object.values(byStation)[0];
  if (first) {
    stationCards[first.station.id]._openWithFiles(first.files);
    stationCards[first.station.id].scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

workbench.addEventListener("click", (e) => {
  if (e.target === wbInput) return;
  wbInput.click();
});
workbench.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); wbInput.click(); }
});
wbInput.addEventListener("change", () => handleIncomingFiles(Array.from(wbInput.files)));
workbench.addEventListener("dragover", (e) => { e.preventDefault(); workbench.classList.add("drag-over"); });
workbench.addEventListener("dragleave", () => workbench.classList.remove("drag-over"));
workbench.addEventListener("drop", (e) => {
  e.preventDefault();
  workbench.classList.remove("drag-over");
  if (e.dataTransfer.files.length) handleIncomingFiles(Array.from(e.dataTransfer.files));
});
