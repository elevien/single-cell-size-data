// Set up the dimensions and margins
const margin = {top: 20, right: 30, bottom: 50, left: 60};
const width = 900 - margin.left - margin.right;
const height = 500 - margin.top - margin.bottom;

// Create the SVG container
const svg = d3.select("#plot")
    .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

// Global variables
let currentData = [];
let availableDatasets = [];
let timeRange = { min: 0, max: 100 };
let currentTimeWindow = 100; // percentage of full range

// Available datasets (using GitHub release URLs to avoid CORS issues)
const datasets = [
    {
        name: "E. Coli (CurrBiol-20-1099-1103_2010)",
        files: [
            { path: "https://github.com/elevien/single-cell-size-data/releases/download/v0.1-alpha/WRB2010.csv", label: "WRB2010 Data" }
        ]
    },
    {
        name: "E. Coli (natscidata-170036-2017)", 
        files: [
            { path: "https://github.com/elevien/single-cell-size-data/releases/download/v0.1-alpha/TPP2017.csv", label: "TPP2017 Data" }
        ]
    },
    {
        name: "L1210 (Manalis lab)",
        files: [
            { path: "https://github.com/elevien/single-cell-size-data/releases/download/v0.1-alpha/LKB2025.csv", label: "LKB2025 Data" }
        ]
    }
];

// Initialize the interface
function init() {
    populateDatasetDropdown();
    setupEventListeners();
    showMessage("info", "Select a dataset to begin visualization");
}

// Populate dataset dropdown
function populateDatasetDropdown() {
    const datasetSelect = d3.select("#dataset-select");
    
    datasetSelect.selectAll("option:not(:first-child)").remove();
    
    datasets.forEach(dataset => {
        dataset.files.forEach(file => {
            datasetSelect.append("option")
                .attr("value", file.path)
                .text(`${dataset.name} - ${file.label}`);
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    d3.select("#dataset-select").on("change", function() {
        const selectedPath = this.value;
        if (selectedPath) {
            loadDataset(selectedPath);
        } else {
            clearExperimentAndLineageDropdowns();
            clearPlot();
        }
    });
    
    d3.select("#experiment-select").on("change", function() {
        updateLineageDropdown();
        updatePlot();
    });
    
    d3.select("#lineage-select").on("change", function() {
        updatePlot();
    });
    
    d3.select("#time-window-slider").on("input", function() {
        currentTimeWindow = +this.value;
        updateTimeRangeDisplay();
        updatePlot();
    });
}

// Load selected dataset
function loadDataset(filePath) {
    showLoading(true);
    hideMessages();
    
    // If running locally and path doesn't start with http, use relative path
    let actualPath = filePath;
    if (window.location.protocol === 'file:' && !filePath.startsWith('http')) {
        // Extract filename from release URL for local fallback
        const filename = filePath.split('/').pop();
        const datasetPath = filePath.includes('WRB2010') ? 'data/CurrBiol-20-1099-1103_2010/' :
                           filePath.includes('TPP2017') ? 'data/natscidata-170036-2017/' :
                           filePath.includes('LKB2025') ? 'data/levien-hokang-etal_2025/' : 'data/';
        actualPath = datasetPath + filename;
    }
    
    d3.csv(actualPath).then(function(data) {
        // Convert numeric columns
        data.forEach(d => {
            d.size = +d.size;
            d.time_units = +d.time_units;
            if (d.cell !== undefined) d.cell = +d.cell;
            if (d.lineage !== undefined) d.lineage = +d.lineage;
            if (d.experiment !== undefined) {
                // Clean up experiment names for better display
                d.experiment = String(d.experiment).replace('.csv', '');
            }
        });
        
        currentData = data;
        populateExperimentDropdown();
        setupTimeWindow();
        showLoading(false);
        showMessage("info", `Loaded ${data.length} data points`);
        
    }).catch(function(error) {
        showLoading(false);
        let errorMsg = `Failed to load dataset: ${error.message}`;
        if (window.location.protocol === 'file:') {
            errorMsg += "\n\nNote: For local use, please run a local server:\npython3 -m http.server 8000\nThen visit http://localhost:8000";
        }
        showMessage("error", errorMsg);
        console.error("Error loading data:", error);
    });
}

// Populate experiment dropdown
function populateExperimentDropdown() {
    const experimentSelect = d3.select("#experiment-select");
    experimentSelect.property("disabled", false);
    
    // Clear existing options except first
    experimentSelect.selectAll("option:not(:first-child)").remove();
    
    // Get unique experiments
    const experiments = [...new Set(currentData.map(d => {
        const exp = d.experiment || "default";
        return exp.replace ? exp.replace('.csv', '') : exp;
    }))]
        .filter(exp => exp !== undefined)
        .sort();
    
    experiments.forEach(exp => {
        experimentSelect.append("option")
            .attr("value", exp)
            .text(exp.length > 30 ? exp.substring(0, 30) + "..." : exp);
    });
    
    // If only one experiment, auto-select it
    if (experiments.length === 1) {
        experimentSelect.property("value", experiments[0]);
        updateLineageDropdown();
    }
}

// Update lineage dropdown based on selected experiment
function updateLineageDropdown() {
    const selectedExperiment = d3.select("#experiment-select").property("value");
    const lineageSelect = d3.select("#lineage-select");
    const lineageGroup = d3.select("#lineage-select").node().parentNode;
    
    if (!selectedExperiment) {
        lineageSelect.property("disabled", true);
        lineageSelect.selectAll("option:not(:first-child)").remove();
        lineageGroup.style.display = "flex";
        return;
    }
    
    lineageSelect.property("disabled", false);
    lineageSelect.selectAll("option:not(:first-child)").remove();
    
    // Filter data by experiment and get unique lineages
    const filteredData = currentData.filter(d => {
        const cleanExp = (d.experiment || "default").replace ? 
            (d.experiment || "default").replace('.csv', '') : 
            (d.experiment || "default");
        return cleanExp === selectedExperiment;
    });
    const lineages = [...new Set(filteredData.map(d => d.lineage || 1))]
        .filter(lineage => lineage !== undefined)
        .sort((a, b) => a - b);
    
    // Hide lineage dropdown if only one lineage
    if (lineages.length <= 1) {
        lineageGroup.style.display = "none";
        if (lineages.length === 1) {
            // Auto-select the single lineage and update plot
            lineageSelect.append("option")
                .attr("value", lineages[0])
                .text(`Lineage ${lineages[0]}`);
            lineageSelect.property("value", lineages[0]);
            updatePlot();
        }
        return;
    }
    
    // Show lineage dropdown if multiple lineages
    lineageGroup.style.display = "flex";
    
    lineages.forEach(lineage => {
        lineageSelect.append("option")
            .attr("value", lineage)
            .text(`Lineage ${lineage}`);
    });
    
    // If only one lineage, auto-select it
    if (lineages.length === 1) {
        lineageSelect.property("value", lineages[0]);
        updatePlot();
    }
}

// Setup time window slider
function setupTimeWindow() {
    if (currentData.length === 0) return;
    
    // Calculate full time range
    timeRange.min = d3.min(currentData, d => d.time_units);
    timeRange.max = d3.max(currentData, d => d.time_units);
    
    // Update slider labels
    d3.select("#time-min").text(timeRange.min.toFixed(1));
    d3.select("#time-max").text(timeRange.max.toFixed(1));
    
    // Reset slider to full range
    currentTimeWindow = 100;
    d3.select("#time-window-slider").property("value", 100);
    
    // Show time window controls
    d3.select("#time-window-group").style("display", "flex");
    
    updateTimeRangeDisplay();
}

// Update time range display
function updateTimeRangeDisplay() {
    const windowSize = (timeRange.max - timeRange.min) * (currentTimeWindow / 100);
    const windowMax = timeRange.min + windowSize;
    
    if (currentTimeWindow >= 100) {
        d3.select("#time-range-display").text("Full range");
    } else {
        d3.select("#time-range-display").text(
            `${timeRange.min.toFixed(1)} - ${windowMax.toFixed(1)} (${currentTimeWindow}%)`
        );
    }
}

// Clear experiment and lineage dropdowns
function clearExperimentAndLineageDropdowns() {
    d3.select("#experiment-select")
        .property("disabled", true)
        .property("value", "")
        .selectAll("option:not(:first-child)").remove();
        
    const lineageSelect = d3.select("#lineage-select");
    const lineageGroup = lineageSelect.node().parentNode;
    
    lineageSelect
        .property("disabled", true)
        .property("value", "")
        .selectAll("option:not(:first-child)").remove();
    
    // Always show lineage dropdown when clearing
    lineageGroup.style.display = "flex";
    
    // Hide time window controls
    d3.select("#time-window-group").style("display", "none");
}

// Update plot based on current selections
function updatePlot() {
    const selectedExperiment = d3.select("#experiment-select").property("value");
    const selectedLineage = d3.select("#lineage-select").property("value");
    
    if (!selectedExperiment || !selectedLineage) {
        clearPlot();
        return;
    }
    
    // Filter data
    let filteredData = currentData.filter(d => {
        const cleanExp = (d.experiment || "default").replace ? 
            (d.experiment || "default").replace('.csv', '') : 
            (d.experiment || "default");
        return cleanExp === selectedExperiment && 
               (d.lineage || 1) == selectedLineage;
    });
    
    // Apply time window filter
    if (currentTimeWindow < 100) {
        const windowSize = (timeRange.max - timeRange.min) * (currentTimeWindow / 100);
        const windowMax = timeRange.min + windowSize;
        filteredData = filteredData.filter(d => 
            d.time_units >= timeRange.min && d.time_units <= windowMax
        );
    }
    
    if (filteredData.length === 0) {
        showMessage("error", "No data found for selected filters");
        clearPlot();
        return;
    }
    
    plotData(filteredData);
}

// Plot the filtered data
function plotData(data) {
    // Clear existing plot
    svg.selectAll("*").remove();
    
    // Group data by cell
    const cellGroups = d3.group(data, d => d.cell || 1);
    
    // Set up scales
    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.time_units))
        .range([0, width]);
    
    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.size))
        .range([height, 0]);
    
    // Add axes
    const xAxis = svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));
    
    const yAxis = svg.append("g")
        .call(d3.axisLeft(yScale));
    
    // Add axis labels
    svg.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .text("Time (units)");
    
    svg.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -40)
        .text("Cell Size");
    
    // Create line generator
    const line = d3.line()
        .x(d => xScale(d.time_units))
        .y(d => yScale(d.size))
        .curve(d3.curveMonotoneX);
    
    // Color scale for different cells
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Add lines for each cell
    cellGroups.forEach((cellData, cellId) => {
        // Sort by time
        const sortedData = cellData.sort((a, b) => a.time_units - b.time_units);
        
        // Add cell trajectory
        svg.append("path")
            .datum(sortedData)
            .attr("class", "line")
            .attr("stroke", colorScale(cellId))
            .attr("stroke-width", 2)
            .attr("fill", "none")
            .attr("d", line);
        
        // Add points
        svg.selectAll(`.point-${cellId}`)
            .data(sortedData)
            .enter().append("circle")
            .attr("class", `point-${cellId}`)
            .attr("cx", d => xScale(d.time_units))
            .attr("cy", d => yScale(d.size))
            .attr("r", 3)
            .attr("fill", colorScale(cellId))
            .append("title")
            .text(d => `Cell ${cellId}, Time: ${d.time_units}, Size: ${d.size.toFixed(2)}`);
    });
    
    hideMessages();
    showMessage("info", `Plotted ${cellGroups.size} cells with ${data.length} total data points`);
}

// Clear the plot
function clearPlot() {
    svg.selectAll("*").remove();
}

// Show/hide loading indicator
function showLoading(show) {
    d3.select("#loading").style("display", show ? "block" : "none");
}

// Show messages
function showMessage(type, message) {
    hideMessages();
    d3.select(`#${type}-message`)
        .style("display", "block")
        .text(message);
}

// Hide all messages
function hideMessages() {
    d3.selectAll(".error, .info").style("display", "none");
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);