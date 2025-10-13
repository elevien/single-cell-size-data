// Set up the dimensions and margins
const margin = {top: 20, right: 30, bottom: 50, left: 60};
const width = 900 - margin.left - margin.right;
const height = 250 - margin.top - margin.bottom;

// Create the SVG containers
const svg = d3.select("#plot")
    .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

const statsWidth = width * 0.6; // Stats plot is 60% of main plot width
const statsSvg = d3.select("#stats-plot")
    .append("svg")
        .attr("width", statsWidth + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
    .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

// Global variables
let currentData = [];
let cellStatistics = [];
let availableDatasets = [];
let timeRange = { min: 0, max: 100 };
let zoomRange = { min: 0, max: 100 };
let isDragging = false;
let dragHandle = null;

// Available datasets (using GitHub raw URLs for .csv files in data folder)
const datasets = [
    {
        name: "E. Coli (CurrBiol-20-1099-1103_2010)",
        files: [
            { path: "https://raw.githubusercontent.com/elevien/single-cell-size-data/main/data/WRB2010.csv", label: "WRB2010 Data" }
        ]
    },
    {
        name: "E. Coli (natscidata-170036-2017)", 
        files: [
            { path: "https://raw.githubusercontent.com/elevien/single-cell-size-data/main/data/TPP2017.csv", label: "TPP2017 Data" }
        ]
    },
    {
        name: "L1210 (Manalis lab)",
        files: [
            { path: "https://raw.githubusercontent.com/elevien/single-cell-size-data/main/data/L1210smr.csv", label: "L1210smr Data" }
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
        plotData();
        plotCellStatistics(); // Update stats plot when experiment changes
    });
    
    d3.select("#lineage-select").on("change", function() {
        plotData();
        // Don't update stats plot - it shows all lineages
    });
    
    d3.select("#reset-zoom").on("click", function() {
        resetZoom();
    });
    
    // Stats plot event handlers
    d3.select("#x-axis-select").on("change", function() {
        plotCellStatistics();
    });
    
    d3.select("#y-axis-select").on("change", function() {
        plotCellStatistics();
    });
    
    // Tab switching handlers
    d3.selectAll(".tab").on("click", function() {
        const tabName = d3.select(this).attr("data-tab");
        switchTab(tabName);
    });
}

// Load selected dataset
function loadDataset(filePath) {
    showLoading(true);
    hideMessages();
    
    // Determine if we're running locally (either file:// or localhost)
    const isLocal = window.location.protocol === 'file:' || 
                   window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname === '';
    
    let actualPath = filePath;
    if (isLocal && filePath.startsWith('https://raw.githubusercontent.com/')) {
        // Extract filename from raw GitHub URL for local fallback
        const filename = filePath.split('/').pop();
        actualPath = 'data/' + filename;
    }
    
    d3.csv(actualPath).then(function(data) {
        // Filter out empty rows
        data = data.filter(d => d && Object.keys(d).length > 0);
        
        if (data.length === 0) {
            throw new Error("No valid data rows found in CSV");
        }
        
        // Convert numeric columns with better error handling
        data.forEach((d, index) => {
            try {
                // Convert size - handle different possible column names
                const sizeValue = d.size || d.Size || d.cell_size || d.volume;
                d.size = sizeValue ? +sizeValue : NaN;
                
                // Compute y as log of normalized size
                if (!isNaN(d.size) && d.size > 0) {
                    d.y = Math.log(d.size);
                } else {
                    d.y = NaN;
                }
                
                // Convert time_units - handle different possible column names  
                const timeValue = d.time_units || d.time || d.Time || d.minutes;
                d.time_units = timeValue ? +timeValue : NaN;
                
                // Convert cell - handle different possible column names
                const cellValue = d.cell || d.Cell || d.cell_id;
                d.cell = cellValue ? +cellValue : 1;
                
                // Convert lineage - handle different possible column names
                const lineageValue = d.lineage || d.Lineage || d.lineage_id;
                d.lineage = lineageValue ? +lineageValue : 1;
                
                // Clean experiment names
                if (d.experiment !== undefined) {
                    d.experiment = String(d.experiment).replace('.csv', '');
                } else {
                    d.experiment = "default";
                }
                
                // Remove rows with invalid size or time data
                if (isNaN(d.y) || isNaN(d.time_units)) {
                    console.warn(`Row ${index} has invalid data:`, d);
                }
            } catch (error) {
                console.warn(`Error processing row ${index}:`, error, d);
            }
        });
        
        // Filter out rows with invalid data
        const validData = data.filter(d => !isNaN(d.y) && !isNaN(d.time_units));
        
        if (validData.length === 0) {
            throw new Error("No rows with valid log size and time data found");
        }
        
        currentData = validData;
        populateExperimentDropdown();
        setupTimeRange();
        enableStatsControls();
        showLoading(false);
        showMessage("info", `Loaded ${validData.length} data points (${data.length - validData.length} invalid rows filtered out)`);
        
    }).catch(function(error) {
        showLoading(false);
        let errorMsg = `Failed to load dataset: ${error.message}`;
        
        // Provide more specific error messages
        if (error.message.includes('404') || actualPath.includes('404')) {
            const isLocal = window.location.protocol === 'file:' || 
                           window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname === '';
            
            if (isLocal) {
                errorMsg = `Dataset file not found (404). Please check if the .csv files exist in your local data/ folder.`;
            } else {
                errorMsg = `Dataset file not found (404). Please check if the .csv files exist in the GitHub repository data/ folder.`;
            }
        } else if (error.message.includes('CORS')) {
            errorMsg = `CORS error loading dataset. The file may not be accessible from this domain.`;
        } else if (error.message.includes('toFixed')) {
            errorMsg = `Data parsing error. The CSV file may have unexpected format or missing columns.`;
        }
        
        // Check if running locally for better error messages
        const isLocal = window.location.protocol === 'file:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '';
        
        if (isLocal && error.message.includes('fetch')) {
            errorMsg = `Failed to load local dataset. Make sure you're running a local server and the data files exist.\n\nTry: python3 -m http.server 8000`;
        }
        
        showMessage("error", errorMsg);
        console.error("Error loading data:", error);
        console.error("Attempted to load from:", actualPath);
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
            plotData();
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
        plotData();
    }
}

// Setup time range
function setupTimeRange() {
    if (currentData.length === 0) return;
    
    // Calculate full time range
    timeRange.min = d3.min(currentData, d => d.time_units);
    timeRange.max = d3.max(currentData, d => d.time_units);
    
    // Reset zoom to full range
    zoomRange.min = timeRange.min;
    zoomRange.max = timeRange.max;
    
    // Show time range controls
    d3.select("#zoom-info-group").style("display", "flex");
    
    updateZoomInfo();
}



// Reset zoom to full range
function resetZoom() {
    zoomRange.min = timeRange.min;
    zoomRange.max = timeRange.max;
    updateZoomInfo();
    plotData();
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
    
    // Hide zoom controls
    d3.select("#zoom-info-group").style("display", "none");
}

// Plot the filtered data
function plotData() {
    const selectedExperiment = d3.select("#experiment-select").property("value");
    const selectedLineage = d3.select("#lineage-select").property("value");
    
    if (!selectedExperiment || !selectedLineage) {
        clearPlot();
        return;
    }
    
    // Filter data
    let data = currentData.filter(d => {
        const cleanExp = (d.experiment || "default").replace ? 
            (d.experiment || "default").replace('.csv', '') : 
            (d.experiment || "default");
        return cleanExp === selectedExperiment && 
               (d.lineage || 1) == selectedLineage;
    });
    
    // Apply zoom range filter
    data = data.filter(d => 
        d.time_units >= zoomRange.min && d.time_units <= zoomRange.max
    );
    
    if (data.length === 0) {
        showMessage("error", "No data found for selected filters");
        clearPlot();
        return;
    }
    // Clear existing plot
    svg.selectAll("*").remove();
    
    // Group data by cell
    const cellGroups = d3.group(data, d => d.cell || 1);
    
    // Set up scales
    const xScale = d3.scaleLinear()
        .domain([zoomRange.min, zoomRange.max])
        .range([0, width]);
    
    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.y))
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
        .text("Log Cell Size");
    
    // Create line generator
    const line = d3.line()
        .x(d => xScale(d.time_units))
        .y(d => yScale(d.y))
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
            .attr("cy", d => yScale(d.y))
            .attr("r", 3)
            .attr("fill", colorScale(cellId))
            .append("title")
            .text(d => `Cell ${cellId}, Time: ${d.time_units}, Log Size: ${d.y.toFixed(3)}`);
    });
    
    // Add zoom controls
    addZoomControls(svg, xScale, width, height);

    hideMessages();
    showMessage("info", `Plotted ${cellGroups.size} cells with ${data.length} total data points`);
}

// Add interactive zoom controls to the plot
function addZoomControls(svg, xScale, width, height) {
    console.log('Adding zoom controls...', {zoomRange, timeRange, width, height});
    
    // Remove any existing zoom controls
    svg.selectAll('.zoom-overlay').remove();
    
    // Create zoom overlay group
    const zoomOverlay = svg.append('g')
        .attr('class', 'zoom-overlay');
    
    // Calculate handle positions - when showing full range, place handles at 10% and 90%
    let leftHandleX, rightHandleX;
    if (Math.abs(zoomRange.min - timeRange.min) < 0.01 && Math.abs(zoomRange.max - timeRange.max) < 0.01) {
        // Full range - place handles at edges with some padding
        leftHandleX = width * 0.1;
        rightHandleX = width * 0.9;
    } else {
        leftHandleX = xScale(zoomRange.min);
        rightHandleX = xScale(zoomRange.max);
    }
    
    console.log('Handle positions:', {leftHandleX, rightHandleX, fullWidth: width});
    
    // Add left handle
    const leftHandle = zoomOverlay.append('g')
        .attr('class', 'zoom-handle left-handle')
        .attr('transform', `translate(${leftHandleX}, 0)`);
    
    // Add invisible wider hit target for easier grabbing
    leftHandle.append('rect')
        .attr('x', -10)
        .attr('y', 0)
        .attr('width', 20)
        .attr('height', height)
        .attr('fill', 'transparent')
        .attr('cursor', 'ew-resize');
    
    // Add visible dashed line
    leftHandle.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 0)
        .attr('y2', height)
        .attr('stroke', '#333333')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .attr('cursor', 'ew-resize')
        .attr('pointer-events', 'none'); // Let the rect handle the events
    
    // Add right handle
    const rightHandle = zoomOverlay.append('g')
        .attr('class', 'zoom-handle right-handle')
        .attr('transform', `translate(${rightHandleX}, 0)`);
    
    // Add invisible wider hit target for easier grabbing
    rightHandle.append('rect')
        .attr('x', -10)
        .attr('y', 0)
        .attr('width', 20)
        .attr('height', height)
        .attr('fill', 'transparent')
        .attr('cursor', 'ew-resize');
    
    // Add visible dashed line
    rightHandle.append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 0)
        .attr('y2', height)
        .attr('stroke', '#333333')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .attr('cursor', 'ew-resize')
        .attr('pointer-events', 'none'); // Let the rect handle the events
    
    // Add drag behavior to left handle
    const leftDrag = d3.drag()
        .on('drag', function(event) {
            const newX = Math.max(0, Math.min(event.x, width - 40));
            const newTimeValue = xScale.invert(newX);
            
            // Update zoom range
            zoomRange.min = Math.max(timeRange.min, Math.min(newTimeValue, zoomRange.max - 0.1));
            
            // Update handle position
            d3.select(this).attr('transform', `translate(${newX}, 0)`);
            
            // Update zoom info
            updateZoomInfo();
        })
        .on('end', function() {
            // Re-plot with new zoom range
            plotData();
        });
    
    // Add drag behavior to right handle
    const rightDrag = d3.drag()
        .on('drag', function(event) {
            const newX = Math.min(width, Math.max(event.x, 40));
            const newTimeValue = xScale.invert(newX);
            
            // Update zoom range
            zoomRange.max = Math.min(timeRange.max, Math.max(newTimeValue, zoomRange.min + 0.1));
            
            // Update handle position
            d3.select(this).attr('transform', `translate(${newX}, 0)`);
            
            // Update zoom info
            updateZoomInfo();
        })
        .on('end', function() {
            // Re-plot with new zoom range
            plotData();
        });
    
    // Apply drag behaviors
    leftHandle.call(leftDrag);
    rightHandle.call(rightDrag);
}

// Update the zoom info display
function updateZoomInfo() {
    const zoomInfo = document.getElementById('zoom-info');
    if (zoomInfo) {
        const percentage = ((zoomRange.max - zoomRange.min) / (timeRange.max - timeRange.min) * 100).toFixed(1);
        zoomInfo.textContent = `Showing ${percentage}% of time range (${zoomRange.min.toFixed(2)} - ${zoomRange.max.toFixed(2)})`;
    }
}

// Clear the plot
function clearPlot() {
    svg.selectAll("*").remove();
}

// Clear the stats plot
function clearStatsPlot() {
    statsSvg.selectAll("*").remove();
}

// Enable stats controls when data is loaded
function enableStatsControls() {
    d3.select("#x-axis-select").property("disabled", false);
    d3.select("#y-axis-select").property("disabled", false);
}

// Switch between tabs
function switchTab(tabName) {
    // Update tab buttons
    d3.selectAll(".tab").classed("active", false);
    d3.select(`[data-tab="${tabName}"]`).classed("active", true);
    
    // Update tab content
    d3.selectAll(".tab-content").classed("active", false);
    d3.select(`#${tabName}-content`).classed("active", true);
    
    // If switching to statistics tab and we have data, plot it
    if (tabName === "statistics" && currentData.length > 0) {
        plotCellStatistics();
    }
}

// Compute cell statistics from time series data
function computeCellStatistics() {
    const selectedExperiment = d3.select("#experiment-select").property("value");
    
    if (!selectedExperiment || !currentData.length) {
        return [];
    }
    
    // Filter data for selected experiment (all lineages)
    const filteredData = currentData.filter(d => {
        const cleanExp = (d.experiment || "default").replace ? 
            (d.experiment || "default").replace('.csv', '') : 
            (d.experiment || "default");
        return cleanExp === selectedExperiment;
    });
    
    // Group by cell
    const cellGroups = d3.group(filteredData, d => d.cell || 1);
    
    console.log(`Processing ${cellGroups.size} cell groups from ${filteredData.length} data points`);
    
    const statistics = [];
    let skippedCells = 0;
    
    cellGroups.forEach((cellData, cellId) => {
        // Sort by time
        const sortedData = cellData.sort((a, b) => a.time_units - b.time_units);
        
        if (sortedData.length < 2) {
            skippedCells++;
            return; // Skip cells with insufficient data
        }
        
        // Compute statistics
        const firstPoint = sortedData[0];
        const lastPoint = sortedData[sortedData.length - 1];
        
        const tau = lastPoint.time_units - firstPoint.time_units; // Generation time
        const phi = lastPoint.y - firstPoint.y; // Size change
        const lambda = tau > 0 ? phi / tau : NaN; // Growth rate - use NaN for invalid cases
        
        // Debug problematic cases
        if (tau <= 0) {
            console.log(`Warning: Cell ${cellId} has tau <= 0: ${tau}`);
        }
        if (!isFinite(phi)) {
            console.log(`Warning: Cell ${cellId} has invalid phi: ${phi}`);
        }
        
        statistics.push({
            cell: cellId,
            lineage: firstPoint.lineage || 1,
            tau: tau,
            phi: phi,
            lambda: lambda,
            initialSize: firstPoint.y,
            finalSize: lastPoint.y
        });
    });
    
    console.log(`Computed statistics for ${statistics.length} cells, skipped ${skippedCells} cells with insufficient data`);
    
    // Check lineage distribution
    const lineageCounts = {};
    statistics.forEach(stat => {
        lineageCounts[stat.lineage] = (lineageCounts[stat.lineage] || 0) + 1;
    });
    console.log('Lineage distribution:', lineageCounts);
    
    return statistics;
}

// Plot cell statistics scatter plot
function plotCellStatistics() {
    const xVar = d3.select("#x-axis-select").property("value");
    const yVar = d3.select("#y-axis-select").property("value");
    
    if (!xVar || !yVar) {
        clearStatsPlot();
        return;
    }
    
    // Compute statistics if not already done or data changed
    cellStatistics = computeCellStatistics();
    
    if (cellStatistics.length === 0) {
        clearStatsPlot();
        showMessage("error", "No cell statistics available for current selection");
        return;
    }
    
    console.log(`Cell statistics computed for ${cellStatistics.length} cells`);
    
    // Clear previous plot
    clearStatsPlot();
    
    // Create scales - using smaller width for stats plot
    const statsWidth = width * 0.6; // Make stats plot 60% of original width
    
    const xScale = d3.scaleLinear()
        .domain(d3.extent(cellStatistics, d => d[xVar]))
        .nice()
        .range([0, statsWidth]);
    
    const yScale = d3.scaleLinear()
        .domain(d3.extent(cellStatistics, d => d[yVar]))
        .nice()
        .range([height, 0]);
    
    // Add axes
    statsSvg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));
    
    statsSvg.append("g")
        .call(d3.axisLeft(yScale));
    
    // Axis labels
    const axisLabels = {
        tau: "τ (Generation time)",
        phi: "φ (Log size change)", 
        lambda: "λ (Growth rate)"
    };
    
    statsSvg.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("x", statsWidth / 2)
        .attr("y", height + 40)
        .text(axisLabels[xVar]);
    
    statsSvg.append("text")
        .attr("class", "axis-label")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -40)
        .text(axisLabels[yVar]);
    
    // Create color scale for lineages
    const lineages = [...new Set(cellStatistics.map(d => d.lineage))].sort((a, b) => a - b);
    
    // Use a combination of color schemes to handle many lineages
    const colors = [
        ...d3.schemeCategory10,           // 10 colors
        ...d3.schemePaired,               // 12 colors
        ...d3.schemeSet3                  // 12 colors
    ];
    
    const colorScale = d3.scaleOrdinal(colors)
        .domain(lineages);
    
    console.log(`Found ${lineages.length} lineages:`, lineages);
    
    // Filter out points with invalid coordinates
    const validPoints = cellStatistics.filter(d => 
        !isNaN(d[xVar]) && !isNaN(d[yVar]) && 
        isFinite(d[xVar]) && isFinite(d[yVar])
    );
    
    console.log(`Plotting ${validPoints.length} valid points out of ${cellStatistics.length} total statistics`);
    
    // Add scatter points colored by lineage
    statsSvg.selectAll(".stat-point")
        .data(validPoints)
        .enter().append("circle")
        .attr("class", "stat-point")
        .attr("cx", d => xScale(d[xVar]))
        .attr("cy", d => yScale(d[yVar]))
        .attr("r", 4)
        .attr("fill", d => colorScale(d.lineage))
        .attr("opacity", 0.7)
        .append("title")
        .text(d => `Cell ${d.cell} (Lineage ${d.lineage})\n${axisLabels[xVar]}: ${d[xVar].toFixed(3)}\n${axisLabels[yVar]}: ${d[yVar].toFixed(3)}`);
    
    hideMessages();
    showMessage("info", `Plotted ${validPoints.length} cells from ${lineages.length} lineages`);
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