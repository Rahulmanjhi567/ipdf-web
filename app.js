// ---------- PDF.js setup ----------
const pdfjsLib = window.pdfjsLib;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const { PDFDocument } = window.PDFLib;

// ---------- UI ----------
const btnUpload = document.getElementById("btnUpload");
const fileInput = document.getElementById("fileInput");
const fileListEl = document.getElementById("fileList");
const viewerHost = document.getElementById("viewerHost");
const fileCountEl = document.getElementById("fileCount");

const btnMerge = document.getElementById("btnMerge");
const btnClear = document.getElementById("btnClear");
const btnDownloadCurrent = document.getElementById("btnDownloadCurrent");

const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const pageInput = document.getElementById("pageInput");
const pageCount = document.getElementById("pageCount");

const btnZoomIn = document.getElementById("btnZoomIn");
const btnZoomOut = document.getElementById("btnZoomOut");
const zoomLabel = document.getElementById("zoomLabel");

// ---------- STATE ----------
// each file: { name, size, originalBytes: Uint8Array }
let files = [];
let selectedIndex = -1;

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let zoom = 1;

// ---------- EVENTS ----------
btnUpload.onclick = () => fileInput.click();

fileInput.addEventListener("change", async (e) => {
  const picked = Array.from(e.target.files || []);
  if (!picked.length) return;

  // ✅ Append mode (बार-बार add होंगे)
  for (const f of picked) {
    const ab = await f.arrayBuffer();
    files.push({
      name: f.name,
      size: f.size,
      originalBytes: new Uint8Array(ab),
    });
  }

  if (selectedIndex < 0) selectedIndex = 0;

  renderFileList();
  enableTopButtons();
  await openSelectedPdf();

  // ✅ same file again select allow
  fileInput.value = "";
});

btnClear.onclick = () => {
  files = [];
  selectedIndex = -1;
  pdfDoc = null;

  viewerHost.innerHTML =
    '<div class="empty-state">Upload PDFs → select a file → preview here</div>';

  disableAllButtons();
  renderFileList();
};

btnMerge.onclick = async () => {
  if (files.length < 2) return;

  btnMerge.disabled = true;
  btnMerge.textContent = "Merging...";

  try {
    const merged = await PDFDocument.create();

    for (const f of files) {
      // ✅ always pass fresh copy (no detached buffer)
      const src = await PDFDocument.load(new Uint8Array(f.originalBytes));
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }

    const out = await merged.save();
    downloadBytes(out, `merged_${Date.now()}.pdf`, "application/pdf");
  } catch (err) {
    alert("Merge failed: " + (err?.message || err));
  }

  btnMerge.textContent = "Merge & Download";
  btnMerge.disabled = files.length < 2;
};

btnDownloadCurrent.onclick = () => {
  if (selectedIndex < 0) return;
  const f = files[selectedIndex];
  downloadBytes(new Uint8Array(f.originalBytes), f.name, "application/pdf");
};

// ---------- VIEWER ----------
async function openSelectedPdf(password = null) {
  if (selectedIndex < 0) return;
  const f = files[selectedIndex];

  try {
    const task = pdfjsLib.getDocument({
      data: new Uint8Array(f.originalBytes), // ✅ fresh copy
      password: password || undefined,
    });

    pdfDoc = await task.promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;
    zoom = 1;

    btnPrev.disabled = false;
    btnNext.disabled = false;
    pageInput.disabled = false;
    btnZoomIn.disabled = false;
    btnZoomOut.disabled = false;

    await renderPage(currentPage);
  } catch (err) {
    const msg = String(err?.message || err);
    const isPassword =
      err?.name === "PasswordException" || msg.toLowerCase().includes("password");

    if (isPassword) {
      const pwd = prompt("PDF is password protected. Enter password:");
      if (pwd) return openSelectedPdf(pwd.trim());
      viewerHost.innerHTML =
        "<div class='empty-state'>Password required to open this PDF.</div>";
      return;
    }

    viewerHost.innerHTML =
      "<div class='empty-state'>Could not open PDF.</div>";
  }
}

async function renderPage(num) {
  if (!pdfDoc) return;

  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: zoom });

  viewerHost.innerHTML = "";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  viewerHost.appendChild(canvas);

  await page.render({ canvasContext: ctx, viewport }).promise;

  pageInput.value = String(num);
  pageCount.textContent = "/ " + totalPages;
  zoomLabel.textContent = Math.round(zoom * 100) + "%";

  btnPrev.disabled = num <= 1;
  btnNext.disabled = num >= totalPages;
}

btnZoomIn.onclick = async () => {
  zoom = Math.min(zoom + 0.2, 3);
  await renderPage(currentPage);
};

btnZoomOut.onclick = async () => {
  zoom = Math.max(zoom - 0.2, 0.5);
  await renderPage(currentPage);
};

btnPrev.onclick = async () => {
  if (currentPage > 1) {
    currentPage--;
    await renderPage(currentPage);
  }
};

btnNext.onclick = async () => {
  if (currentPage < totalPages) {
    currentPage++;
    await renderPage(currentPage);
  }
};

pageInput.onchange = async () => {
  const n = Number(pageInput.value || 1);
  if (n >= 1 && n <= totalPages) {
    currentPage = n;
    await renderPage(currentPage);
  }
};

// ---------- UI HELPERS ----------
function renderFileList() {
  if (fileCountEl) fileCountEl.textContent = String(files.length);

  if (!files.length) {
    fileListEl.classList.add("empty");
    fileListEl.textContent = "No PDFs selected";
    return;
  }

  fileListEl.classList.remove("empty");
  fileListEl.innerHTML = "";

  files.forEach((f, i) => {
    const div = document.createElement("div");
    div.className = "file-item" + (i === selectedIndex ? " active" : "");
    div.innerHTML = `
      <div style="font-size:18px">📄</div>
      <div style="min-width:0">
        <div class="file-name">${escapeHtml(f.name)}</div>
        <div class="file-meta">${(f.size / 1024).toFixed(1)} KB</div>
      </div>
    `;

    div.onclick = async () => {
      selectedIndex = i;
      renderFileList();
      await openSelectedPdf();
    };

    fileListEl.appendChild(div);
  });
}

function enableTopButtons() {
  btnClear.disabled = false;
  btnDownloadCurrent.disabled = false;
  btnMerge.disabled = files.length < 2;
}

function disableAllButtons() {
  btnMerge.disabled = true;
  btnClear.disabled = true;
  btnDownloadCurrent.disabled = true;
  btnPrev.disabled = true;
  btnNext.disabled = true;
  pageInput.disabled = true;
  btnZoomIn.disabled = true;
  btnZoomOut.disabled = true;
  pageCount.textContent = "/ 0";
  zoomLabel.textContent = "100%";
}

function downloadBytes(bytes, filename, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(str || "").replace(/[&<>"']/g, (m) => map[m]);
}

// init
disableAllButtons();
renderFileList();