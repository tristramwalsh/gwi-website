/**
 * GWI Utils - Shared utilities for Global Warming Index visualizations
 *
 * This module provides centralized configuration, statistical functions,
 * CSV parsing utilities, and Chart.js plugins used across the GWI application.
 *
 * Usage: All utilities are exposed via the global `GWIUtils` object.
 */
(function () {
  "use strict";

  // ============================================
  // CONFIGURATION CONSTANTS
  // ============================================

  /**
   * Central configuration object for all GWI visualizations.
   * Modify these values to change behavior across all charts.
   */
  const CONFIG = {
    // Baseline period for temperature anomaly calculations
    BASELINE_PERIOD_START: 1850,
    BASELINE_PERIOD_END: 1900,

    // HadCRUT5 default realization count (dynamically overridden if data differs)
    HADCRUT_REALIZATION_COUNT: 200,

    // Chart appearance constants
    PLUME_ALPHA: 0.2,
    FAINT_ALPHA: 0.1,
    Y_AXIS_PADDING_FACTOR: 0.15,
    X_AXIS_STEP_SIZE: 20,
    Y_AXIS_STEP_SIZE: 0.5,
    FONT_FAMILY: "Roboto, Open Sans, sans-serif",

    // Animation timing
    ANIMATION_STEP_DURATION: 6000,
  };

  // ============================================
  // ERROR HANDLING
  // ============================================

  /**
   * Centralized error handler for data loading and parsing errors.
   * Logs to console and optionally displays user-friendly message.
   *
   * @param {string} context - Description of where the error occurred
   * @param {Error|string} error - The error object or message
   * @param {boolean} [fatal=false] - If true, throws an error to halt execution
   */
  function handleError(context, error, fatal = false) {
    const message = `[GWI Error] ${context}: ${error}`;
    console.error(message);

    if (fatal) {
      throw new Error(message);
    }
  }

  // ============================================
  // STATISTICAL UTILITIES
  // ============================================

  /**
   * Calculate a percentile value from a sorted array using linear interpolation.
   *
   * @param {number[]} sortedArray - Array of numbers, must be sorted ascending
   * @param {number} percentile - Percentile to calculate (0-100)
   * @returns {number} The interpolated percentile value, or NaN if array is empty
   */
  function calculatePercentile(sortedArray, percentile) {
    if (!sortedArray || sortedArray.length === 0) return NaN;
    if (sortedArray.length === 1) return sortedArray[0];

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sortedArray[lower];
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  // ============================================
  // COLOR UTILITIES
  // ============================================

  /**
   * Add alpha transparency to an RGB/RGBA color string.
   *
   * @param {string} color - Color in rgb() or rgba() format
   * @param {number} alpha - Alpha value (0-1)
   * @returns {string} Color in rgba() format with new alpha
   */
  function withAlpha(color, alpha) {
    const match = (color || "").match(
      /rgb\s*a?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i
    );
    if (!match) return color;
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
  }

  // ============================================
  // CSV PARSING UTILITIES
  // ============================================

  /**
   * Build a column mapping for two-row header CSVs (variable + percentile format).
   * Returns both the mapping and a helper function to safely extract values.
   *
   * Expected CSV format:
   *   Row 0: variable,GHG,GHG,GHG,Nat,Nat,Nat,...
   *   Row 1: percentile,5,50,95,5,50,95,...
   *
   * @param {string} headerVarRow - First header row (variable names)
   * @param {string} headerPercRow - Second header row (percentiles)
   * @param {string[]} [requiredVariables] - Optional array of variables that must exist
   * @returns {{ colMap: Object, getVal: Function }} Column map and value getter
   * @throws {Error} If required variables are missing
   */
  function buildColumnMap(headerVarRow, headerPercRow, requiredVariables) {
    const headerVar = headerVarRow.split(",");
    const headerPerc = headerPercRow.split(",");
    const colMap = {};

    headerVar.forEach((v, i) => {
      v = v.trim();
      const p = headerPerc[i] ? headerPerc[i].trim() : "";
      if (!colMap[v]) colMap[v] = {};
      colMap[v][p] = i;
    });

    // Validate required variables if specified
    if (requiredVariables && requiredVariables.length > 0) {
      const missing = requiredVariables.filter((v) => !colMap[v]);
      if (missing.length > 0) {
        handleError(
          "CSV Header Validation",
          `Missing required variables: ${missing.join(", ")}`,
          true
        );
      }
    }

    /**
     * Safely get a value from a data row by variable and percentile.
     *
     * @param {string[]} cols - Split data row
     * @param {string} variable - Variable name (e.g., "GHG", "Nat")
     * @param {string} percentile - Percentile string (e.g., "5", "50", "95")
     * @returns {number} Parsed float value, or NaN if not found
     */
    const getVal = (cols, variable, percentile) => {
      if (colMap[variable] && colMap[variable][percentile] !== undefined) {
        return parseFloat(cols[colMap[variable][percentile]]);
      }
      return NaN;
    };

    return { colMap, getVal };
  }

  /**
   * Parse HadCRUT5 ensemble CSV and return baseline-adjusted percentiles.
   *
   * Expected format:
   *   Row 0: Time,Fraction...,Coverage...,Realization 1,Realization 2,...
   *   Row 1+: Data rows
   *
   * @param {string} csvText - Raw CSV text content
   * @returns {{ years: number[], p5: number[], p50: number[], p95: number[] }}
   * @throws {Error} If "Realization 1" column cannot be found
   */
  function parseHadcrutData(csvText) {
    const lines = csvText.split("\n").filter((l) => l.trim() !== "");
    const header = lines[0].split(",");

    // Find the start of realization columns
    const realizationStartIdx = header.findIndex(
      (h) => h.trim() === "Realization 1"
    );

    if (realizationStartIdx === -1) {
      handleError(
        "HadCRUT Parsing",
        "Could not find 'Realization 1' column in header. " +
          "Expected format: Time,Fraction...,Coverage...,Realization 1,Realization 2,...",
        true
      );
    }

    const dataLines = lines.slice(1);

    // Dynamically determine number of realizations from first data row
    let numRealizations = CONFIG.HADCRUT_REALIZATION_COUNT;
    if (dataLines.length > 0) {
      const firstParts = dataLines[0].split(",");
      const detectedRealizations = firstParts.length - realizationStartIdx;
      if (detectedRealizations !== numRealizations) {
        console.warn(
          `[GWI] HadCRUT realization count differs from default: ` +
            `expected ${numRealizations}, found ${detectedRealizations}. Using detected count.`
        );
        numRealizations = detectedRealizations;
      }
    }

    const baselineValues = [];
    const yearlyRawPercentiles = [];

    dataLines.forEach((line) => {
      const cols = line.split(",").map(parseFloat);
      if (cols.length < realizationStartIdx + numRealizations) return;

      const year = cols[0];
      if (isNaN(year) || year < CONFIG.BASELINE_PERIOD_START) return;

      const vals = cols
        .slice(realizationStartIdx, realizationStartIdx + numRealizations)
        .sort((a, b) => a - b);

      const p5 = calculatePercentile(vals, 5);
      const p50 = calculatePercentile(vals, 50);
      const p95 = calculatePercentile(vals, 95);

      yearlyRawPercentiles.push({ year, p5, p50, p95 });

      if (
        year >= CONFIG.BASELINE_PERIOD_START &&
        year <= CONFIG.BASELINE_PERIOD_END
      ) {
        baselineValues.push(p50);
      }
    });

    // Calculate baseline (average of medians from baseline period)
    const baseline =
      baselineValues.length > 0
        ? baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length
        : 0;

    return {
      years: yearlyRawPercentiles.map((d) => d.year),
      p5: yearlyRawPercentiles.map((d) => d.p5 - baseline),
      p50: yearlyRawPercentiles.map((d) => d.p50 - baseline),
      p95: yearlyRawPercentiles.map((d) => d.p95 - baseline),
    };
  }

  /**
   * Parse generic GWI/ERF/Priors CSV data (2-row header format).
   *
   * Expected format:
   *   Row 0: variable names (Ant, GHG, Nat, ...)
   *   Row 1: percentiles (5, 50, 95)
   *   Row 3+: Data (Year, val, val, val...)
   *
   * @param {string} csvText - Raw CSV text content
   * @param {Object} [options] - Configuration options
   * @param {string[]} [options.requiredVars] - List of variables to validate/extract (if omitted, extracts all found)
   * @param {number} [options.minYear] - Filter out data before this year
   * @returns {Object} { years: number[], [Variable]: { p5: number[], p50: number[], p95: number[] } }
   */
  function parseGwiData(csvText, options = {}) {
    const lines = csvText.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("#"));
    
    // Use shared column map builder
    // lines[0] is Variables, lines[1] is Percentiles
    const { colMap, getVal } = buildColumnMap(lines[0], lines[1], options.requiredVars);

    const dataLines = lines.slice(3);
    const years = [];
    
    // Initialize result structure for all found variables in colMap
    const res = { years };
    Object.keys(colMap).forEach(v => {
      res[v] = { p5: [], p50: [], p95: [] };
    });

    dataLines.forEach((line) => {
      const cols = line.split(",");
      const year = parseFloat(cols[0]);

      if (isNaN(year)) return;
      if (options.minYear !== undefined && year < options.minYear) return;

      years.push(year);

      Object.keys(colMap).forEach((variable) => {
        // We attempt to get 5, 50, 95. If not present, they will be NaN (getVal default behavior check needed or handled by getVal return)
        // getVal returns NaN if not found.
        res[variable].p5.push(getVal(cols, variable, "5"));
        res[variable].p50.push(getVal(cols, variable, "50"));
        res[variable].p95.push(getVal(cols, variable, "95"));
      });
    });

    return res;
  }

  // ============================================
  // CHART.JS PLUGINS
  // ============================================

  /**
   * Chart.js plugin that draws a vertical line at the hovered data point.
   */
  const verticalHoverLinePlugin = {
    id: "verticalHoverLine",
    beforeDraw: (chart) => {
      if (chart.tooltip._active && chart.tooltip._active.length) {
        const ctx = chart.ctx;
        ctx.save();
        const activePoint = chart.tooltip._active[0];
        const x = activePoint.element.x;
        const topY = chart.chartArea.top;
        const bottomY = chart.chartArea.bottom;

        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, bottomY);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.1)";
        ctx.stroke();
        ctx.restore();
      }
    },
  };

  /**
   * Create a Chart.js plugin that displays a logo image on the chart.
   *
   * @param {string} logoSrc - Path to the logo image
   * @param {Object} [options] - Configuration options
   * @param {string} [options.position='bottom-right'] - 'bottom-right' (default) or 'top-left'
   * @param {number} [options.bottomValue=-0.5] - Y-axis value for bottom of logo band (for bottom-right)
   * @param {number} [options.padding=10] - Padding around logo in pixels
   * @param {number} [options.heightFactor=0.15] - Logo height as fraction of chart height (for top-left)
   * @returns {Object} Chart.js plugin object with getImage() method for onload handling
   */
  function createLogoPlugin(logoSrc, options = {}) {
    const logoImg = new Image();
    logoImg.src = logoSrc;

    const bottomValue = options.bottomValue !== undefined ? options.bottomValue : -0.5;
    const padding = options.padding !== undefined ? options.padding : 10;
    const position = options.position || "bottom-right";

    return {
      id: "logoPlugin",
      afterDraw: (chart) => {
        if (logoImg.complete && logoImg.naturalHeight !== 0) {
          const ctx = chart.ctx;
          const { chartArea } = chart;
          let xPos, yPos, w, h;

          if (position === "top-left") {
            const chartHeight = chartArea.bottom - chartArea.top;
            const heightFactor = options.heightFactor || 0.15;
            h = chartHeight * heightFactor;
            
            const aspectRatio = logoImg.naturalWidth / logoImg.naturalHeight;
            w = h * aspectRatio;

            xPos = chartArea.left + padding;
            yPos = chartArea.top + padding;
          } else {
            // Default: bottom-right band logic
            const yAxis = chart.scales.y;
            // Ensure yAxis exists
            if (!yAxis) return;

            const yZero = yAxis.getPixelForValue(0);
            const yBottom = yAxis.getPixelForValue(bottomValue);
            const bandHeight = Math.abs(yBottom - yZero);

            h = bandHeight - 2 * padding;

            if (h <= 0) return;

            const aspectRatio = logoImg.naturalWidth / logoImg.naturalHeight;
            w = h * aspectRatio;

            xPos = chartArea.right - w - padding;
            const yMid = (yZero + yBottom) / 2;
            yPos = yMid - h / 2;
          }

          ctx.save();
          ctx.drawImage(logoImg, xPos, yPos, w, h);
          ctx.restore();
        }
      },
      getImage: () => logoImg,
    };
  }

  // ============================================
  // CHART INTERACTION UTILITIES
  // ============================================

  /**
   * Centralized legend onClick handler for toggling related datasets.
   * Handles the standard GWI pattern where a primary dataset has associated
   * uncertainty ranges (5%, 95%) or other related datasets.
   *
   * @param {Object} e - The click event
   * @param {Object} legendItem - The clicked legend item
   * @param {Object} legend - The legend instance
   * @param {Function} [customMatcher] - Optional function(clickedLabel, currentDatasetLabel) -> boolean
   */
  function handleLegendClick(e, legendItem, legend, customMatcher) {
    const chart = legend.chart;
    const clickedLabel = chart.data.datasets[legendItem.datasetIndex].label;
    const datasets = chart.data.datasets;

    const indicesToToggle = [];
    datasets.forEach((ds, idx) => {
      const label = ds.label;
      let match = false;

      if (customMatcher) {
        match = customMatcher(clickedLabel, label);
      }
      
      // Default GWI matching logic if no custom matcher or if it returns false (additive)
      if (!match) {
        // Exact match
        if (label === clickedLabel) {
          match = true;
        }
        // Standard suffixes
        else if (
          label === clickedLabel + " 5%" ||
          label === clickedLabel + " 95%" ||
          label === clickedLabel + " Range"
        ) {
          match = true;
        }
      }

      if (match) {
        indicesToToggle.push(idx);
      }
    });

    indicesToToggle.forEach((idx) => {
      const meta = chart.getDatasetMeta(idx);
      meta.hidden = meta.hidden === null ? !datasets[idx].hidden : null;
    });

    chart.update();
  }

  // ============================================
  // CHART.JS TOOLTIP POSITIONER
  // ============================================

  /**
   * Register custom tooltip positioner that follows cursor Y position.
   * Only registers if Chart.js is available.
   */
  function registerTooltipPositioner() {
    if (typeof Chart !== "undefined" && Chart.Tooltip) {
      Chart.Tooltip.positioners.cursor = function (elements, eventPosition) {
        if (!elements.length) return false;
        return {
          x: elements[0].element.x,
          y: eventPosition.y,
        };
      };
    }
  }

  // Register tooltip positioner on load
  registerTooltipPositioner();

  // ============================================
  // EXPORT TO GLOBAL NAMESPACE
  // ============================================

  window.GWIUtils = {
    // Configuration
    CONFIG: CONFIG,

    // Error handling
    handleError: handleError,

    // Statistical utilities
    calculatePercentile: calculatePercentile,

    // Color utilities
    withAlpha: withAlpha,

    // CSV parsing
    buildColumnMap: buildColumnMap,
    parseHadcrutData: parseHadcrutData,
    parseGwiData: parseGwiData,

    // Chart.js plugins
    verticalHoverLinePlugin: verticalHoverLinePlugin,
    createLogoPlugin: createLogoPlugin,

    // Chart interaction utilities
    handleLegendClick: handleLegendClick,

    // Re-register tooltip positioner (for dynamic Chart.js loading)
    registerTooltipPositioner: registerTooltipPositioner,
  };
})();
