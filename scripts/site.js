const METADATA_PATH = "metadata/datasets.json";
const SVG_NS = "http://www.w3.org/2000/svg";

async function loadMetadata() {
  const response = await fetch(METADATA_PATH);
  if (!response.ok) {
    throw new Error(`Failed to load metadata (${response.status})`);
  }
  return response.json();
}

function renderDatasetList(metadata) {
  const listEl = document.getElementById("dataset-list");
  const organismMenuEl = document.getElementById("organism-menu");
  if (!listEl || !organismMenuEl) return;

  const primaryDatasets = metadata.datasets.filter((d) => d.kind !== "summary");
  const organisms = [...new Set(primaryDatasets.map((d) => d.organism))].sort();

  function datasetItem(dataset) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "dataset-link";
    a.href = `dataset.html?id=${encodeURIComponent(dataset.id)}`;
    a.innerHTML = `
      <div>
        <div class="dataset-name">${dataset.display_name}</div>
        <div class="dataset-meta">${dataset.method}</div>
      </div>
      <div class="arrow">-></div>
    `;
    li.appendChild(a);
    return li;
  }

  function setActiveOrganism(organism) {
    listEl.innerHTML = "";

    const filteredDatasets = organism === "all"
      ? primaryDatasets
      : primaryDatasets.filter((dataset) => dataset.organism === organism);

    filteredDatasets.forEach((dataset) => listEl.appendChild(datasetItem(dataset)));

    document.querySelectorAll(".organism-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.organism === organism);
    });
  }

  organismMenuEl.innerHTML = "";
  const filterOptions = ["all", ...organisms];

  filterOptions.forEach((organism) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "organism-chip";
    chip.dataset.organism = organism;
    chip.textContent = organism === "all" ? "All" : organism;
    chip.addEventListener("click", () => setActiveOrganism(organism));
    organismMenuEl.appendChild(chip);
  });

  setActiveOrganism("all");
}

function renderDatasetPage(metadata) {
  const container = document.getElementById("dataset-detail");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const dataset = metadata.datasets.find((d) => d.id === id);

  if (!dataset) {
    container.innerHTML = `<p class="status">Dataset not found.</p>`;
    return;
  }

  const paperTitle = dataset.paper?.title || "Unavailable";
  const paperYear = dataset.paper?.year ? ` (${dataset.paper.year})` : "";
  const paperUrl = dataset.paper?.url;

  container.innerHTML = `
    <h1>${dataset.display_name}</h1>
    <p class="lead">${dataset.notes || ""}</p>

    <dl class="kv">
      <dt>Organism</dt><dd>${dataset.organism || "-"}</dd>
      <dt>System</dt><dd>${dataset.system || "-"}</dd>
      <dt>Method</dt><dd>${dataset.method || "-"}</dd>
      <dt>Size Units</dt><dd>${dataset.size_units || "-"}</dd>
      <dt>Time Units</dt><dd>${dataset.time_units || "-"}</dd>
      <dt>Reference</dt><dd>${paperUrl ? `<a href="${paperUrl}">${paperTitle}${paperYear}</a>` : `${paperTitle}${paperYear}`}</dd>
      <dt>DOI</dt><dd>${dataset.paper?.doi || "-"}</dd>
    </dl>

    <div class="actions">
      <a class="button" href="index.html">Back to datasets</a>
      <button class="button primary" id="open-inline-viewer" type="button">Open interactive viewer</button>
      <a class="button" href="${dataset.primary_file}">Open CSV</a>
    </div>

    <section id="inline-viewer" class="inline-viewer" hidden>
      <h2 class="section-title">Size Trajectories</h2>
      <div class="viewer-controls">
        <label for="lineage-select-inline">Lineage</label>
        <select id="lineage-select-inline"></select>
        <button class="button" id="zoom-in" type="button">Zoom in</button>
        <button class="button" id="zoom-out" type="button">Zoom out</button>
        <button class="button" id="zoom-reset" type="button">Reset</button>
      </div>
      <p id="viewer-status" class="status"></p>
      <div class="viewer-plot-wrap">
        <svg id="viewer-svg" viewBox="0 0 900 380" preserveAspectRatio="xMidYMid meet"></svg>
      </div>
    </section>
  `;

  setupInlineViewer(dataset);
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  const headers = rows[0].split(",");

  return rows.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });
    return row;
  });
}

function setupInlineViewer(dataset) {
  const openBtn = document.getElementById("open-inline-viewer");
  const viewerEl = document.getElementById("inline-viewer");
  const lineageSelect = document.getElementById("lineage-select-inline");
  const statusEl = document.getElementById("viewer-status");
  const svg = document.getElementById("viewer-svg");
  if (!openBtn || !viewerEl || !lineageSelect || !statusEl || !svg) return;

  let loaded = false;
  let combos = [];
  let rows = [];
  let selectedIndex = 0;
  let domains = { baseX: [0, 1], x: [0, 1], y: [0, 1] };

  const dims = {
    width: 900,
    height: 380,
    margin: { top: 20, right: 28, bottom: 44, left: 58 }
  };

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function getRange(selectedRows, key) {
    const vals = selectedRows.map((d) => d[key]).filter((v) => Number.isFinite(v));
    if (!vals.length) return [0, 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) return [min - 1, max + 1];
    const pad = (max - min) * 0.05;
    return [min - pad, max + pad];
  }

  function xPixel(x) {
    const innerW = dims.width - dims.margin.left - dims.margin.right;
    return dims.margin.left + ((x - domains.x[0]) / (domains.x[1] - domains.x[0])) * innerW;
  }

  function yPixel(y) {
    const innerH = dims.height - dims.margin.top - dims.margin.bottom;
    return dims.margin.top + innerH - ((y - domains.y[0]) / (domains.y[1] - domains.y[0])) * innerH;
  }

  function makeTicks(range, count = 5) {
    const [min, max] = range;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) return [min];
    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => min + step * i);
  }

  function formatTick(value) {
    if (!Number.isFinite(value)) return "";
    return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
  }

  function drawAxis() {
    const innerW = dims.width - dims.margin.left - dims.margin.right;
    const innerH = dims.height - dims.margin.top - dims.margin.bottom;

    const axisColor = "#587370";

    const xAxis = document.createElementNS(SVG_NS, "line");
    xAxis.setAttribute("x1", String(dims.margin.left));
    xAxis.setAttribute("x2", String(dims.margin.left + innerW));
    xAxis.setAttribute("y1", String(dims.margin.top + innerH));
    xAxis.setAttribute("y2", String(dims.margin.top + innerH));
    xAxis.setAttribute("stroke", axisColor);
    xAxis.setAttribute("stroke-width", "1");
    svg.appendChild(xAxis);

    const yAxis = document.createElementNS(SVG_NS, "line");
    yAxis.setAttribute("x1", String(dims.margin.left));
    yAxis.setAttribute("x2", String(dims.margin.left));
    yAxis.setAttribute("y1", String(dims.margin.top));
    yAxis.setAttribute("y2", String(dims.margin.top + innerH));
    yAxis.setAttribute("stroke", axisColor);
    yAxis.setAttribute("stroke-width", "1");
    svg.appendChild(yAxis);

    const xTicks = makeTicks(domains.x, 6);
    xTicks.forEach((tick) => {
      const x = xPixel(tick);
      const tickLine = document.createElementNS(SVG_NS, "line");
      tickLine.setAttribute("x1", String(x));
      tickLine.setAttribute("x2", String(x));
      tickLine.setAttribute("y1", String(dims.margin.top + innerH));
      tickLine.setAttribute("y2", String(dims.margin.top + innerH + 6));
      tickLine.setAttribute("class", "viewer-tick");
      svg.appendChild(tickLine);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(x));
      label.setAttribute("y", String(dims.margin.top + innerH + 20));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "viewer-tick-label");
      label.textContent = formatTick(tick);
      svg.appendChild(label);
    });

    const yTicks = makeTicks(domains.y, 6);
    yTicks.forEach((tick) => {
      const y = yPixel(tick);
      const tickLine = document.createElementNS(SVG_NS, "line");
      tickLine.setAttribute("x1", String(dims.margin.left - 6));
      tickLine.setAttribute("x2", String(dims.margin.left));
      tickLine.setAttribute("y1", String(y));
      tickLine.setAttribute("y2", String(y));
      tickLine.setAttribute("class", "viewer-tick");
      svg.appendChild(tickLine);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(dims.margin.left - 10));
      label.setAttribute("y", String(y + 4));
      label.setAttribute("text-anchor", "end");
      label.setAttribute("class", "viewer-tick-label");
      label.textContent = formatTick(tick);
      svg.appendChild(label);
    });

    const xLabel = document.createElementNS(SVG_NS, "text");
    xLabel.setAttribute("x", String(dims.margin.left + innerW / 2));
    xLabel.setAttribute("y", String(dims.height - 10));
    xLabel.setAttribute("text-anchor", "middle");
    xLabel.setAttribute("class", "viewer-axis-label");
    xLabel.textContent = `Time (${dataset.time_units || "units"})`;
    svg.appendChild(xLabel);

    const yLabel = document.createElementNS(SVG_NS, "text");
    yLabel.setAttribute("x", "18");
    yLabel.setAttribute("y", String(dims.margin.top + innerH / 2));
    yLabel.setAttribute("text-anchor", "middle");
    yLabel.setAttribute("class", "viewer-axis-label");
    yLabel.setAttribute("transform", `rotate(-90 18 ${dims.margin.top + innerH / 2})`);
    yLabel.textContent = `Size (${dataset.size_units || "units"})`;
    svg.appendChild(yLabel);
  }

  function drawTrajectory() {
    svg.innerHTML = "";
    const selectedCombo = combos[selectedIndex];
    if (!selectedCombo) {
      setStatus("No lineages available for this dataset.");
      return;
    }

    const selectedRows = rows
      .filter((d) => d.experiment === selectedCombo.experiment && d.lineage === selectedCombo.lineage)
      .sort((a, b) => a.time_units - b.time_units);

    if (!selectedRows.length) {
      setStatus("No trajectory points found for selected lineage.");
      return;
    }

    // Y auto-adjusts to currently visible x-window
    const visibleRows = selectedRows.filter(
      (d) => d.time_units >= domains.x[0] && d.time_units <= domains.x[1]
    );
    domains.y = getRange(visibleRows.length ? visibleRows : selectedRows, "size");

    const perCell = new Map();
    selectedRows.forEach((d) => {
      if (!perCell.has(d.cell)) perCell.set(d.cell, []);
      perCell.get(d.cell).push(d);
    });

    drawAxis();

    perCell.forEach((points) => {
      const visiblePoints = points.filter(
        (p) => p.time_units >= domains.x[0] && p.time_units <= domains.x[1]
      );
      if (visiblePoints.length < 2) return;

      const path = document.createElementNS(SVG_NS, "path");
      const dPath = visiblePoints
        .map((p, i) => `${i === 0 ? "M" : "L"} ${xPixel(p.time_units)} ${yPixel(p.size)}`)
        .join(" ");
      path.setAttribute("d", dPath);
      path.setAttribute("class", "viewer-line");
      svg.appendChild(path);
    });

    setStatus(`${selectedCombo.experiment} | lineage ${selectedCombo.lineage} | ${selectedRows.length} points`);
  }

  function resetZoom() {
    domains.x = [...domains.baseX];
    drawTrajectory();
  }

  function zoom(factor) {
    const xCenter = (domains.x[0] + domains.x[1]) / 2;
    const xHalf = ((domains.x[1] - domains.x[0]) * factor) / 2;
    domains.x = [xCenter - xHalf, xCenter + xHalf];
    drawTrajectory();
  }

  function panX(deltaPx) {
    const fullSpan = domains.baseX[1] - domains.baseX[0];
    if (fullSpan <= 0) return;

    const currentSpan = domains.x[1] - domains.x[0];
    const innerWidth = dims.width - dims.margin.left - dims.margin.right;
    if (innerWidth <= 0) return;

    const shift = (deltaPx / innerWidth) * currentSpan;
    let nextMin = domains.x[0] + shift;
    let nextMax = domains.x[1] + shift;

    // Clamp panning to base data extent.
    if (nextMin < domains.baseX[0]) {
      nextMin = domains.baseX[0];
      nextMax = nextMin + currentSpan;
    }
    if (nextMax > domains.baseX[1]) {
      nextMax = domains.baseX[1];
      nextMin = nextMax - currentSpan;
    }

    domains.x = [nextMin, nextMax];
    drawTrajectory();
  }

  function updateSelection(index) {
    selectedIndex = index;
    const selectedCombo = combos[selectedIndex];
    const selectedRows = rows.filter(
      (d) => d.experiment === selectedCombo.experiment && d.lineage === selectedCombo.lineage
    );
    domains.baseX = getRange(selectedRows, "time_units");
    resetZoom();
  }

  async function loadData() {
    try {
      setStatus("Loading trajectories...");
      const response = await fetch(dataset.primary_file);
      if (!response.ok) {
        throw new Error(`Could not load CSV (${response.status})`);
      }

      const text = await response.text();
      const rawRows = parseCsv(text);
      rows = rawRows
        .map((d) => ({
          experiment: d.experiment || "default",
          lineage: String(d.lineage ?? "1"),
          cell: String(d.cell ?? "1"),
          time_units: Number(d.time_units ?? d.time ?? d.Time ?? d.minutes),
          size: Number(d.size ?? d.Size ?? d.cell_size ?? d.volume)
        }))
        .filter((d) => Number.isFinite(d.time_units) && Number.isFinite(d.size));

      if (!rows.length) {
        throw new Error("No valid size trajectory rows found in dataset.");
      }

      const comboMap = new Map();
      rows.forEach((d) => {
        const key = `${d.experiment}|||${d.lineage}`;
        if (!comboMap.has(key)) {
          comboMap.set(key, { experiment: d.experiment, lineage: d.lineage });
        }
      });

      combos = Array.from(comboMap.values()).sort((a, b) => {
        const exp = a.experiment.localeCompare(b.experiment);
        if (exp !== 0) return exp;
        return Number(a.lineage) - Number(b.lineage);
      });

      lineageSelect.innerHTML = "";
      combos.forEach((combo, idx) => {
        const option = document.createElement("option");
        option.value = String(idx);
        option.textContent = `${combo.experiment} | lineage ${combo.lineage}`;
        lineageSelect.appendChild(option);
      });

      lineageSelect.value = "0";
      updateSelection(0);
      loaded = true;
    } catch (error) {
      setStatus(error.message);
    }
  }

  openBtn.addEventListener("click", async () => {
    viewerEl.hidden = false;
    viewerEl.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!loaded) {
      await loadData();
    }
  });

  lineageSelect.addEventListener("change", () => {
    updateSelection(Number(lineageSelect.value));
  });

  document.getElementById("zoom-in")?.addEventListener("click", () => zoom(0.8));
  document.getElementById("zoom-out")?.addEventListener("click", () => zoom(1.25));
  document.getElementById("zoom-reset")?.addEventListener("click", () => resetZoom());

  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    const horizontalScroll = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    if (horizontalScroll || event.shiftKey) {
      const delta = horizontalScroll ? event.deltaX : event.deltaY;
      panX(delta);
      return;
    }
    zoom(event.deltaY < 0 ? 0.9 : 1.1);
  }, { passive: false });
}

async function bootstrap() {
  try {
    const metadata = await loadMetadata();
    renderDatasetList(metadata);
    renderDatasetPage(metadata);
  } catch (error) {
    const list = document.getElementById("dataset-list");
    if (list) {
      list.innerHTML = `<li class="status">${error.message}</li>`;
    }
    const detail = document.getElementById("dataset-detail");
    if (detail) {
      detail.innerHTML = `
        <p class="status">${error.message}</p>
        <div class="actions">
          <a class="button" href="index.html">Back to datasets</a>
        </div>
      `;
    }
  }
}

bootstrap();
