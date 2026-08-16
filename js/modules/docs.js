/**
 * Word <-> PDF.
 *
 * PDF -> Word: pdf.js extracts text per page (grouped into lines by
 * y-position), then the `docx` library builds a plain paragraph-per-line
 * .docx. No layout/image fidelity — this is a text-extraction tool, not a
 * layout-preserving converter.
 *
 * Word -> PDF: mammoth.js turns the .docx into HTML, which is rendered
 * off-screen and rasterized page-by-page into a PDF via html2canvas +
 * jsPDF. Output text is not selectable (it's an image), but layout,
 * fonts-as-rendered, and basic styling carry over.
 */
const DocsTool = (() => {
  const PDF_TYPE = ["application/pdf"];
  const DOCX_TYPE = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

  // ---------------------------------------------------------- PDF -> Word

  const pdfToWordTool = {
    label: "PDF → Word",
    render(container, initialFiles) {
      container.innerHTML = "";
      const note = UI.el("div", { class: "note warn" },
        "Extracts text only — layout, images, and complex formatting are not preserved."
      );
      const state = { file: null };
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(PDF_TYPE, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name}`;
      });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Convert to Word");

      runBtn.onclick = async () => {
        if (!state.file || !window.pdfjsLib || !window.docx) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        try {
          const bytes = await state.file.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
          const paragraphs = [];

          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const content = await page.getTextContent();
            // Group text items into lines by rounded y-position.
            const lines = new Map();
            content.items.forEach((item) => {
              const y = Math.round(item.transform[5]);
              if (!lines.has(y)) lines.set(y, []);
              lines.get(y).push(item.str);
            });
            const sortedY = [...lines.keys()].sort((a, b) => b - a);
            paragraphs.push(new docx.Paragraph({
              text: `— Page ${i} —`,
              heading: docx.HeadingLevel.HEADING_3,
            }));
            sortedY.forEach((y) => {
              const text = lines.get(y).join(" ").trim();
              if (text) paragraphs.push(new docx.Paragraph({ text }));
            });
          }

          const doc = new docx.Document({ sections: [{ children: paragraphs }] });
          const blob = await docx.Packer.toBlob(doc);
          results.appendChild(UI.resultItem(`${state.file.name.replace(/\.pdf$/i, "")}.docx`, blob));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Conversion failed: ${e.message}`));
        }
        UI.setProgress(progress, false);
      };

      container.append(note, dropZone, info, runBtn, progress, results);
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  // ---------------------------------------------------------- Word -> PDF

  const wordToPdfTool = {
    label: "Word → PDF",
    render(container, initialFiles) {
      container.innerHTML = "";
      const note = UI.el("div", { class: "note warn" },
        "Renders the document to an image-based PDF — good for sharing/printing, " +
        "but the resulting PDF text won't be selectable/searchable."
      );
      const state = { file: null };
      const info = UI.el("div", { class: "note" }, "No file loaded yet.");
      const dropZone = UI.fileDropMini(DOCX_TYPE, false, (files) => {
        state.file = files[0];
        info.textContent = `Loaded: ${state.file.name}`;
      });
      const results = UI.el("div", { class: "results" });
      const progress = UI.progressEl();
      const runBtn = UI.el("button", { class: "btn" }, "Convert to PDF");

      runBtn.onclick = async () => {
        if (!state.file || !window.mammoth || !window.html2canvas || !window.jspdf) return;
        UI.setProgress(progress, true);
        results.innerHTML = "";
        let renderHost = null;
        try {
          const arrayBuffer = await state.file.arrayBuffer();
          const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

          renderHost = document.createElement("div");
          renderHost.style.cssText = "position:fixed; left:-10000px; top:0; width:794px; padding:40px; background:#fff; color:#111; font-family:Georgia,serif; font-size:14px; line-height:1.5;";
          renderHost.innerHTML = html;
          document.body.appendChild(renderHost);

          const canvas = await html2canvas(renderHost, { scale: 2, backgroundColor: "#ffffff" });
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF({ unit: "pt", format: "a4" });
          const pageW = pdf.internal.pageSize.getWidth();
          const pageH = pdf.internal.pageSize.getHeight();
          const imgW = pageW;
          const imgH = (canvas.height * imgW) / canvas.width;

          let heightLeft = imgH;
          let position = 0;
          const imgData = canvas.toDataURL("image/jpeg", 0.92);

          pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
          heightLeft -= pageH;
          while (heightLeft > 0) {
            position = heightLeft - imgH;
            pdf.addPage();
            pdf.addImage(imgData, "JPEG", 0, position, imgW, imgH);
            heightLeft -= pageH;
          }

          const blob = pdf.output("blob");
          results.appendChild(UI.resultItem(`${state.file.name.replace(/\.docx$/i, "")}.pdf`, blob));
        } catch (e) {
          results.appendChild(UI.el("div", { class: "note warn" }, `Conversion failed: ${e.message}`));
        } finally {
          if (renderHost) renderHost.remove();
        }
        UI.setProgress(progress, false);
      };

      container.append(note, dropZone, info, runBtn, progress, results);
      if (initialFiles && initialFiles[0]) dropZone.dispatchDrop([initialFiles[0]]);
    },
  };

  return {
    accepts: [...PDF_TYPE, ...DOCX_TYPE],
    tools: { pdfToWord: pdfToWordTool, wordToPdf: wordToPdfTool },
  };
})();
