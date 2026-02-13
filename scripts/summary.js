const META_PATH = "metadata/datasets.json";
const SUMMARY_PATH = "data/coarse_grained_parameters.csv";

const xSelect = document.getElementById("summary-x");
const ySelect = document.getElementById("summary-y");
const plotEl = document.getElementById("summary-plot");
const legendEl = document.getElementById("summary-legend");
const statusEl = document.getElementById("summary-status");
const tooltipEl = document.getElementById("summary-tooltip");

const dims = { width: 920, height: 520, margin: { top: 18, right: 20, bottom: 56, left: 72 } };
let state = {
  rows: [],
  numericColumns: [],
  color: null
};

function setStatus(message) {
  statusEl.textContent = message;
}

async function loadCsv(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  const text = await response.text();
  return d3.csvParse(text);
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

async function buildExperimentMap(rawDatasets) {
  const map = new Map();

  await Promise.all(
    rawDatasets.map(async (dataset) => {
      try {
        const rows = await loadCsv(dataset.primary_file);
        rows.forEach((row) => {
          const experiment = (row.experiment || "").trim();
          if (!experiment) return;
          if (!map.has(experiment)) {
            map.set(experiment, dataset);
          }
        });
      } catch {
        // Keep viewer functional even if one raw dataset fails to load
      }
    })
  );

  return map;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "NA";
  if (Math.abs(value) >= 100) return value.toFixed(2);
  return value.toFixed(3);
}

function renderLegend(color) {
  const organisms = color.domain();
  legendEl.innerHTML = "";

  organisms.forEach((organism) => {
    const item = document.createElement("div");
    item.className = "summary-legend-item";
    item.innerHTML = `
      <span class="summary-legend-swatch" style="background:${color(organism)}"></span>
      <span>${organism}</span>
    `;
    legendEl.appendChild(item);
  });
}

function setupAxisDropdowns(columns) {
  xSelect.innerHTML = "";
  ySelect.innerHTML = "";

  columns.forEach((col) => {
    const xOpt = document.createElement("option");
    xOpt.value = col;
    xOpt.textContent = col;
    xSelect.appendChild(xOpt);

    const yOpt = document.createElement("option");
    yOpt.value = col;
    yOpt.textContent = col;
    ySelect.appendChild(yOpt);
  });

  xSelect.value = columns.includes("tau_mean") ? "tau_mean" : columns[0];
  ySelect.value = columns.includes("phi_mean") ? "phi_mean" : columns[Math.min(1, columns.length - 1)];
}

function makeScales(rows, xKey, yKey) {
  const xVals = rows.map((d) => d[xKey]).filter(isFiniteNumber);
  const yVals = rows.map((d) => d[yKey]).filter(isFiniteNumber);

  const xExtent = d3.extent(xVals);
  const yExtent = d3.extent(yVals);

  const xPad = ((xExtent[1] ?? 1) - (xExtent[0] ?? 0)) * 0.08 || 1;
  const yPad = ((yExtent[1] ?? 1) - (yExtent[0] ?? 0)) * 0.08 || 1;

  const x = d3.scaleLinear()
    .domain([xExtent[0] - xPad, xExtent[1] + xPad])
    .range([dims.margin.left, dims.width - dims.margin.right]);

  const y = d3.scaleLinear()
    .domain([yExtent[0] - yPad, yExtent[1] + yPad])
    .range([dims.height - dims.margin.bottom, dims.margin.top]);

  return { x, y };
}

function hideTooltip() {
  tooltipEl.hidden = true;
}

function showTooltip(event, d, xKey, yKey) {
  const link = d.datasetId
    ? `<a href="dataset.html?id=${encodeURIComponent(d.datasetId)}">Open dataset</a>`
    : "No linked dataset";

  tooltipEl.innerHTML = `
    <div><strong>${d.experiment}</strong></div>
    <div>Organism: ${d.organism}</div>
    <div>${xKey}: ${formatNumber(d[xKey])}</div>
    <div>${yKey}: ${formatNumber(d[yKey])}</div>
    <div>${d.datasetId ? "Click point to open dataset." : ""}</div>
  `;

  const rect = plotEl.getBoundingClientRect();
  const left = event.clientX - rect.left + 12;
  const top = event.clientY - rect.top + 12;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.hidden = false;
}

function renderPlot() {
  const xKey = xSelect.value;
  const yKey = ySelect.value;

  const rows = state.rows.filter((d) => isFiniteNumber(d[xKey]) && isFiniteNumber(d[yKey]));
  if (!rows.length) {
    setStatus(`No plottable points for ${xKey} vs ${yKey}.`);
    plotEl.innerHTML = "";
    hideTooltip();
    return;
  }

  const { x, y } = makeScales(rows, xKey, yKey);

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${dims.width} ${dims.height}`)
    .attr("class", "summary-svg");

  svg.append("g")
    .attr("transform", `translate(0,${dims.height - dims.margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6));

  svg.append("g")
    .attr("transform", `translate(${dims.margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6));

  svg.append("text")
    .attr("x", (dims.width + dims.margin.left - dims.margin.right) / 2)
    .attr("y", dims.height - 14)
    .attr("text-anchor", "middle")
    .attr("class", "summary-axis-label")
    .text(xKey);

  svg.append("text")
    .attr("x", 18)
    .attr("y", (dims.height + dims.margin.top - dims.margin.bottom) / 2)
    .attr("text-anchor", "middle")
    .attr("transform", `rotate(-90 18 ${(dims.height + dims.margin.top - dims.margin.bottom) / 2})`)
    .attr("class", "summary-axis-label")
    .text(yKey);

  svg.append("g")
    .selectAll("circle")
    .data(rows)
    .join("circle")
    .attr("cx", (d) => x(d[xKey]))
    .attr("cy", (d) => y(d[yKey]))
    .attr("r", 5)
    .attr("class", "summary-dot")
    .attr("fill", (d) => state.color(d.organism))
    .on("mouseenter", function(event, d) {
      d3.select(this).attr("r", 7);
      showTooltip(event, d, xKey, yKey);
    })
    .on("mousemove", (event, d) => showTooltip(event, d, xKey, yKey))
    .on("mouseleave", function() {
      d3.select(this).attr("r", 5);
      hideTooltip();
    })
    .on("click", (_, d) => {
      if (d.datasetId) {
        window.location.href = `dataset.html?id=${encodeURIComponent(d.datasetId)}`;
      }
    });

  plotEl.innerHTML = "";
  plotEl.appendChild(svg.node());
  setStatus(`Showing ${rows.length} points.`);
}

async function init() {
  try {
    setStatus("Loading summary statistics...");

    const metadata = await fetch(META_PATH).then((r) => r.json());
    const rawDatasets = metadata.datasets.filter((d) => d.kind !== "summary");
    const summaryRows = await loadCsv(SUMMARY_PATH);
    const experimentMap = await buildExperimentMap(rawDatasets);

    const numericColumns = Object.keys(summaryRows[0] || {})
      .filter((key) => key !== "experiment")
      .filter((key) => summaryRows.some((row) => Number.isFinite(Number(row[key]))));

    state.numericColumns = numericColumns;
    state.rows = summaryRows.map((row) => {
      const experiment = (row.experiment || "").trim();
      const dataset = experimentMap.get(experiment);
      const parsed = { experiment };

      numericColumns.forEach((key) => {
        const value = Number(row[key]);
        parsed[key] = Number.isFinite(value) ? value : NaN;
      });

      parsed.organism = dataset?.organism || "Unknown";
      parsed.datasetId = dataset?.id || null;
      return parsed;
    });

    const organisms = [...new Set(state.rows.map((d) => d.organism))].sort();
    state.color = d3.scaleOrdinal()
      .domain(organisms)
      .range(d3.schemeTableau10.concat(d3.schemeSet2));

    setupAxisDropdowns(numericColumns);
    renderLegend(state.color);
    renderPlot();

    xSelect.addEventListener("change", renderPlot);
    ySelect.addEventListener("change", renderPlot);
  } catch (error) {
    setStatus(error.message);
  }
}

init();
