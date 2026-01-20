(function () {
  function init() {
    Promise.all([
      fetch("assets/data/gwi/gwi_timeseries.csv").then((r) => r.text()),
      fetch("assets/data/erf/erf_timeseries.csv").then((r) => r.text()),
      fetch("assets/data/emissions_co2/cumulative-co2-including-land.csv").then(
        (r) => r.text(),
      ),
      fetch(
        "assets/data/temp/HadCRUT.5.0.2.0.analysis.ensemble_series.global.annual.csv",
      ).then((r) => r.text()),
    ])
      .then(([gwiText, erfText, co2Text, hadcrutText]) => {
        const data = processData(gwiText, erfText, co2Text, hadcrutText);
        plotGraph(data);
      })
      .catch((err) => console.error("Error loading forcings graph data:", err));
  }

  function processData(gwiText, erfText, co2Text, hadcrutText) {
    // 1. GWI Parsing (Get Ant-50)
    // Header is 2 rows. Row 1: variable, Row 2: percentile
    const gwiLines = gwiText
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"));
    // Find indices
    const gwiHeader1 = gwiLines[0].split(",");
    const gwiHeader2 = gwiLines[1].split(",");
    let ant50Idx = -1;
    for (let i = 0; i < gwiHeader1.length; i++) {
      if (gwiHeader1[i].trim() === "Ant" && gwiHeader2[i].trim() === "50") {
        ant50Idx = i;
        break;
      }
    }

    const gwiData = { years: [], ant50: [] };
    const gwiDataLines = gwiLines.slice(3);
    const yearMap = new Map(); // Use map to sync data

    gwiDataLines.forEach((line) => {
      const parts = line.split(",");
      if (parts.length <= ant50Idx) return;
      const year = parseFloat(parts[0]);
      const val = parseFloat(parts[ant50Idx]);
      if (!isNaN(year) && !isNaN(val)) {
        gwiData.years.push(year);
        gwiData.ant50.push(val);
        yearMap.set(year, { ant: val }); // Init year map
      }
    });

    // 2. ERF Parsing (Get Ant-50 and co2-50 to calc "Other")
    const erfLines = erfText.split("\n").filter((l) => l.trim());
    const erfHeader1 = erfLines[0].split(",");
    const erfHeader2 = erfLines[1].split(",");

    let erfAnt50Idx = -1;
    let erfCo250Idx = -1;
    for (let i = 0; i < erfHeader1.length; i++) {
      const v = erfHeader1[i].trim();
      const p = erfHeader2[i].trim();
      if (v === "Ant" && p === "50") erfAnt50Idx = i;
      if (v === "co2" && p === "50") erfCo250Idx = i;
    }

    const erfDataLines = erfLines.slice(3);
    erfDataLines.forEach((line) => {
      const parts = line.split(",");
      const year = parseFloat(parts[0]);
      if (yearMap.has(year)) {
        const ant = parseFloat(parts[erfAnt50Idx]);
        const co2 = parseFloat(parts[erfCo250Idx]);
        // Other human forcings = Ant - co2
        if (!isNaN(ant) && !isNaN(co2)) {
          yearMap.get(year).otherForcing = ant - co2;
        }
      }
    });

    // 3. CO2 Emissions Parsing
    const co2Lines = co2Text.split("\n").filter((l) => l.trim());
    // Header: Entity, Code, Year, ...
    const co2Header = co2Lines[0].split(",");
    const entityIdx = co2Header.indexOf("Entity");
    const yearIdx = co2Header.indexOf("Year");
    // Find the value column (long name)
    const valIdx = co2Header.findIndex((h) => h.includes("Cumulative CO"));

    const co2DataLines = co2Lines.slice(1);
    co2DataLines.forEach((line) => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // regex split for CSV
      if (parts[entityIdx] === "World") {
        const year = parseFloat(parts[yearIdx]);
        const val = parseFloat(parts[valIdx]);
        if (yearMap.has(year)) {
          // Convert to Trillion Tonnes (TtCO2)
          yearMap.get(year).co2 = val / 1e12;
        }
      }
    });

    // 4. HadCRUT Parsing (Observed Temp)
    const hadLines = hadcrutText.split("\n").filter((l) => l.trim());
    const hadData = { years: [], val: [], error_upper: [], error_lower: [] };

    // Calculate baseline 1850-1900
    let baselineSum = 0;
    let baselineCount = 0;
    const hadDataTemp = []; // Store temporarily to apply baseline later

    hadLines.slice(1).forEach((line) => {
      const parts = line.split(",");
      const year = parseInt(parts[0]);
      const realizations = parts
        .slice(3, 203)
        .map((v) => parseFloat(v))
        .sort((a, b) => a - b);

      const p5 = realizations[9];
      const p50 = (realizations[99] + realizations[100]) / 2;
      const p95 = realizations[189];

      if (year >= 1850 && year <= 1900) {
        baselineSum += p50;
        baselineCount++;
      }
      hadDataTemp.push({ year, p5, p50, p95 });
    });

    const baseline = baselineCount > 0 ? baselineSum / baselineCount : 0;

    hadDataTemp.forEach((d) => {
      hadData.years.push(d.year);
      hadData.val.push(d.p50 - baseline);
      hadData.error_upper.push(d.p95 - baseline); // Absolute value for bar chart
      hadData.error_lower.push(d.p5 - baseline); // Absolute value for bar chart
    });

    // consolidate final arrays for plotting
    const years = [];
    const ant = [];
    const co2 = [];
    const other = [];

    // Iterate sorted years
    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);

    sortedYears.forEach((y) => {
      const d = yearMap.get(y);
      if (d.ant !== undefined) {
        years.push(y);
        ant.push(d.ant);
        co2.push(d.co2 || 0);
        other.push(d.otherForcing || 0);
      }
    });

    return { years, ant, co2, other, hadData };
  }

  function plotGraph(data) {
    const ctx = document.getElementById("forcings-chart").getContext("2d");
    const style = getComputedStyle(document.documentElement);

    const withAlpha = (color, alpha) => {
      const match = (color || "").match(
        /rgb\s*a?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
      );
      if (!match) return color;
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    };

    // Canvas helper functions for custom legend swatches
    const createCircleSwatch = (color, radius) => {
      const size = radius * 2 + 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      return canvas;
    };

    const createSplitColorSwatch = (colorLeft, colorRight, width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      // Left half
      ctx.fillStyle = colorLeft;
      ctx.fillRect(0, 0, width / 2, height);
      // Right half
      ctx.fillStyle = colorRight;
      ctx.fillRect(width / 2, 0, width / 2, height);
      return canvas;
    };

    const createAreaWithLineSwatch = (fillColor, lineColor, width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      // Fill area
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, 0, width, height);
      // Dashed line on top
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(width, 2);
      ctx.stroke();
      return canvas;
    };

    // Calculate Scaling Factor
    const lastIdx = data.years.length - 1;
    const lastAnt = data.ant[lastIdx];
    const lastStack = data.co2[lastIdx] + data.other[lastIdx];

    // 2. Calculate Scaling Ratio
    const ratio = lastStack / lastAnt;

    // Fetch colors from CSS Variables
    const colorAnthro = style
      .getPropertyValue("--color-plot-anthropogenic")
      .trim();
    const colorAnthroForcing = style
      .getPropertyValue("--color-plot-anthro-forcing")
      .trim();
    const colorCO2Base = style.getPropertyValue("--color-plot-co2").trim();
    const colorCO2 = withAlpha(colorCO2Base, 0.2);
    const colorTotal = style.getPropertyValue("--color-plot-total").trim();
    const colorNonCO2 = style.getPropertyValue("--color-plot-non-co2").trim();
    const colorNonCO2Neg = style
      .getPropertyValue("--color-plot-non-co2-neg")
      .trim();
    const colorObs = withAlpha(
      style.getPropertyValue("--color-plot-observations").trim(),
      0.5,
    );
    const colorObsErr = withAlpha(
      style.getPropertyValue("--color-plot-observations").trim(),
      0.2, // Half of original 0.4
    );

    // Prepare Data for Chart.js

    // 1. CO2 (Bottom Area)
    const dsCO2 = {
      label: "Cumulative CO₂ emissions area",
      data: data.years.map((y, i) => ({ x: y, y: data.co2[i] })),
      backgroundColor: colorCO2,
      borderColor: "transparent",
      fill: "origin",
      pointRadius: 0,
      yAxisID: "y1",
      order: 3,
    };

    // 1.5 CO2 Top Line
    const dsCO2Line = {
      label: "Cumulative CO₂ emissions",
      data: data.years.map((y, i) => ({ x: y, y: data.co2[i] })),
      borderColor: colorCO2Base,
      borderWidth: 3,
      borderDash: [3, 3],
      fill: false,
      pointRadius: 0,
      pointStyle: "line",
      yAxisID: "y1",
      order: 2,
    };

    // 2. Other (Top Area - Manually Stacked)
    // Store original data for animation purposes
    const ocdStackedPos = data.years.map((y, i) => ({
      x: y,
      y: data.co2[i] + Math.max(0, data.other[i]),
    }));
    const ocdStackedNeg = data.years.map((y, i) => ({
      x: y,
      y: data.co2[i] + Math.min(0, data.other[i]),
    }));
    const ocdOriginPos = data.years.map((y, i) => ({
      x: y,
      y: Math.max(0, data.other[i]),
    }));
    const ocdOriginNeg = data.years.map((y, i) => ({
      x: y,
      y: Math.min(0, data.other[i]),
    }));

    // Positive Non-CO2
    const dsOtherPos = {
      label: "Other climate drivers",
      data: ocdStackedPos.map((p) => ({ ...p })),
      backgroundColor: withAlpha(colorNonCO2, 0.6),
      borderColor: "transparent",
      fill: 0, // Fill to dsCO2 (will be updated dynamically)
      pointRadius: 0,
      pointStyle: "line",
      yAxisID: "y1",
      order: 3,
    };

    // Negative Non-CO2
    const dsOtherNeg = {
      label: "Other climate drivers (negative)",
      data: ocdStackedNeg.map((p) => ({ ...p })),
      backgroundColor: withAlpha(colorNonCO2Neg, 0.6),
      borderColor: "transparent",
      fill: 0, // Fill to dsCO2 (will be updated dynamically)
      pointRadius: 0,
      yAxisID: "y1",
      order: 3,
    };

    // 2.5 Total Anthropogenic Forcing (Line)
    const totalForcing = data.co2.map((v, i) => v + data.other[i]);
    const dsTotal = {
      label: "All human-induced drivers",
      data: data.years.map((y, i) => ({ x: y, y: totalForcing[i] })),
      borderColor: colorAnthroForcing, // DISTINCT GREY
      backgroundColor: colorAnthroForcing,
      borderWidth: 3,
      borderDash: [3, 3],
      fill: false,
      pointRadius: 0,
      pointStyle: "line",
      yAxisID: "y1",
      order: 2,
      stack: undefined,
    };

    // 3. Observed Temp (Dots)
    const dsObs = {
      label: "Annual observations",
      data: data.hadData.years.map((y, i) => ({
        x: y,
        y: data.hadData.val[i],
      })),
      borderColor: colorObs,
      backgroundColor: colorObs,
      borderWidth: 0,
      fill: false,
      pointRadius: 2,
      pointStyle: "circle",
      showLine: false,
      yAxisID: "y",
      order: 1,
    };

    // Error Bars
    const dsObsErr = {
      label: "Observations Range",
      data: data.hadData.years.map((y, i) => ({
        x: y,
        y: [data.hadData.error_lower[i], data.hadData.error_upper[i]],
      })),
      type: "bar",
      backgroundColor: colorObsErr,
      barThickness: 1,
      yAxisID: "y",
      order: 1,
      grouped: false,
      legend: { display: false },
      tooltip: { enabled: false },
      hoverBackgroundColor: colorObsErr,
    };

    // 4. Human-induced Warming
    const dsAnt = {
      label: "Human-induced warming",
      data: data.years.map((y, i) => ({ x: y, y: data.ant[i] })),
      borderColor: colorAnthro,
      backgroundColor: colorAnthro,
      borderWidth: 3,
      fill: false,
      pointRadius: 0,
      pointStyle: "line",
      yAxisID: "y",
      order: 0, // Top
    };

    // Plugin: Vertical Hover Line
    const verticalHoverLine = {
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

    const logoImg = new Image();
    logoImg.src = "assets/img/eci-oxford-blue-text-RGB.png";

    const logoPlugin = {
      id: "logoPlugin",
      afterDraw: (chart) => {
        if (logoImg.complete && logoImg.naturalHeight !== 0) {
          const ctx = chart.ctx;
          const yAxis = chart.scales.y;

          // Constraints: Between -0.5 and 0 on Y axis
          const yZero = yAxis.getPixelForValue(0);
          const yBottom = yAxis.getPixelForValue(-0.5);

          // Calculate height of the band
          const bandHeight = Math.abs(yBottom - yZero);
          const padding = 10;

          // Available height for image
          const h = bandHeight - 2 * padding;

          if (h > 0) {
            const aspectRatio = logoImg.naturalWidth / logoImg.naturalHeight;
            const w = h * aspectRatio;

            // Position: Bottom right of the chart area
            // Right edge aligned with chartArea.right
            const xPos = chart.chartArea.right - w - padding;

            // Y Position: Centered in the band
            const yMid = (yZero + yBottom) / 2;
            const yPos = yMid - h / 2;

            ctx.save();
            ctx.drawImage(logoImg, xPos, yPos, w, h);
            ctx.restore();
          }
        }
      },
    };

    const config = {
      type: "line",
      data: {
        datasets: [
          dsCO2,
          dsCO2Line,
          dsOtherPos,
          dsOtherNeg,
          dsTotal,
          dsObs,
          dsObsErr,
          dsAnt,
        ],
      },
      plugins: [verticalHoverLine, logoPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          x: {
            type: "linear",
            min: 1850,
            max: data.years[data.years.length - 1] + 2,
            offset: false,
            grid: {
              display: false,
            },
            afterBuildTicks: function (axis) {
              const dataMax = data.years[data.years.length - 1];
              const hasMax = axis.ticks.find((t) => t.value === dataMax);
              if (!hasMax) {
                axis.ticks.push({ value: dataMax });
              }
              // Filter out any ticks that are greater than dataMax
              axis.ticks = axis.ticks.filter((t) => t.value <= dataMax);
              axis.ticks.sort((a, b) => a.value - b.value);
            },
            ticks: {
              stepSize: 20,
              callback: (v) => v.toString().replace(",", ""),
            },
          },
          y: {
            type: "linear",
            display: true,
            position: "left",
            min: -0.5,
            max: 2.0,
            ticks: {
              stepSize: 0.5,
            },
            title: {
              display: true,
              text: "GMST Warming relative to 1850-1900 (°C)",
            },
            grid: {
              display: true,
              drawOnChartArea: true, // Main grid
            },
          },
          y1: {
            type: "linear",
            display: true,
            position: "right",
            min: -0.5 * ratio,
            max: 2.0 * ratio,
            ticks: {
              stepSize: 0.5 * ratio,
            },
            title: {
              display: true,
              text: "Cumulative CO₂ emissions (TtCO₂) & other drivers (W/m²)",
            },
            grid: {
              display: false,
              drawOnChartArea: false, // Don't draw grid for secondary axis to avoid clutter
            },
            stacked: false, // DISABLE AUTOMATIC STACKING
          },
        },
        plugins: {
          title: {
            display: true,
            text: "Global Warming Index & Forcing Contributions",
            font: { size: 16, family: "Roboto, Open Sans, sans-serif" },
          },
          legend: {
            position: "bottom",
            onClick: function (e, legendItem, legend) {
              const chart = legend.chart;
              const clickedLabel =
                chart.data.datasets[legendItem.datasetIndex].label;
              const datasets = chart.data.datasets;

              // Helper to find dataset index by label
              const findIdx = (label) =>
                datasets.findIndex((d) => d.label === label);
              const isVisible = (label) =>
                chart.isDatasetVisible(findIdx(label));

              // Find all related datasets by semantic label patterns
              const indicesToToggle = [];
              datasets.forEach((ds, idx) => {
                const label = ds.label;
                if (
                  clickedLabel === "Annual observations" &&
                  (label === "Annual observations" ||
                    label.includes("Observations"))
                ) {
                  indicesToToggle.push(idx);
                } else if (
                  clickedLabel === "Cumulative CO₂ emissions" &&
                  label.startsWith("Cumulative CO₂")
                ) {
                  indicesToToggle.push(idx);
                } else if (
                  clickedLabel === "Other climate drivers" &&
                  label.startsWith("Other climate drivers")
                ) {
                  indicesToToggle.push(idx);
                } else if (label === clickedLabel) {
                  indicesToToggle.push(idx);
                }
              });

              // Determine visibility states BEFORE toggle
              const co2Visible = isVisible("Cumulative CO₂ emissions");
              const ocdVisible = isVisible("Other climate drivers");
              const clickedIsCO2 = clickedLabel === "Cumulative CO₂ emissions";
              const clickedIsOCD = clickedLabel === "Other climate drivers";

              // Determine visibility states AFTER toggle
              const co2WillBeVisible = clickedIsCO2 ? !co2Visible : co2Visible;
              const ocdWillBeVisible = clickedIsOCD ? !ocdVisible : ocdVisible;

              // Get dataset indices
              const idxOtherPos = findIdx("Other climate drivers");
              const idxOtherNeg = findIdx("Other climate drivers (negative)");
              const idxTotal = findIdx("All human-induced drivers");
              const idxCO2Area = findIdx("Cumulative CO₂ emissions area");

              // Animation helper
              const animateOCD = (toStacked, callback) => {
                const duration = 400;
                const startTime = performance.now();
                const dsPos = datasets[idxOtherPos];
                const dsNeg = datasets[idxOtherNeg];
                const startPosData = dsPos.data.map((p) => ({ ...p }));
                const startNegData = dsNeg.data.map((p) => ({ ...p }));
                const targetPosData = toStacked ? ocdStackedPos : ocdOriginPos;
                const targetNegData = toStacked ? ocdStackedNeg : ocdOriginNeg;

                const animate = (currentTime) => {
                  const elapsed = currentTime - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  const eased = 1 - Math.pow(1 - progress, 3);

                  for (let i = 0; i < dsPos.data.length; i++) {
                    dsPos.data[i].y =
                      startPosData[i].y +
                      (targetPosData[i].y - startPosData[i].y) * eased;
                    dsNeg.data[i].y =
                      startNegData[i].y +
                      (targetNegData[i].y - startNegData[i].y) * eased;
                  }
                  chart.update("none");

                  if (progress < 1) {
                    requestAnimationFrame(animate);
                  } else if (callback) {
                    callback();
                  }
                };
                requestAnimationFrame(animate);
              };

              // Case: Toggling CO2 off while OCD is visible
              if (clickedIsCO2 && co2Visible && ocdWillBeVisible) {
                // Keep fill tied to the CO2 wedge during animation so the OCD shading base
                // follows the CO2 line in each frame.
                datasets[idxOtherPos].fill = idxCO2Area;
                datasets[idxOtherNeg].fill = idxCO2Area;

                const duration = 400;
                const startTime = performance.now();
                const dsPos = datasets[idxOtherPos];
                const dsNeg = datasets[idxOtherNeg];
                const dsCO2 = datasets[idxCO2Area];
                const dsCO2Line = datasets[findIdx("Cumulative CO₂ emissions")];
                const startPosData = dsPos.data.map((p) => ({ ...p }));
                const startNegData = dsNeg.data.map((p) => ({ ...p }));
                const startCO2Data = dsCO2.data.map((p) => ({ ...p }));
                const startCO2LineData = dsCO2Line.data.map((p) => ({ ...p }));

                const animate = (currentTime) => {
                  const elapsed = currentTime - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  const eased = 1 - Math.pow(1 - progress, 3);

                  for (let i = 0; i < dsPos.data.length; i++) {
                    // Animate OCD to origin position
                    dsPos.data[i].y =
                      startPosData[i].y +
                      (ocdOriginPos[i].y - startPosData[i].y) * eased;
                    dsNeg.data[i].y =
                      startNegData[i].y +
                      (ocdOriginNeg[i].y - startNegData[i].y) * eased;
                    // Animate CO2 to zero
                    dsCO2.data[i].y = startCO2Data[i].y * (1 - eased);
                    dsCO2Line.data[i].y = startCO2LineData[i].y * (1 - eased);
                  }
                  chart.update("none");

                  if (progress < 1) {
                    requestAnimationFrame(animate);
                  } else {
                    // Detach OCD shading from CO2 before hiding/restoring CO2 datasets.
                    datasets[idxOtherPos].fill = "origin";
                    datasets[idxOtherNeg].fill = "origin";

                    // Hide CO2 datasets
                    indicesToToggle.forEach((idx) => {
                      chart.getDatasetMeta(idx).hidden = true;
                    });
                    chart.getDatasetMeta(idxTotal).hidden = true;
                    // Restore CO2 data for when it's shown again
                    for (let i = 0; i < dsCO2.data.length; i++) {
                      dsCO2.data[i].y = startCO2Data[i].y;
                      dsCO2Line.data[i].y = startCO2LineData[i].y;
                    }
                    chart.update();
                  }
                };
                requestAnimationFrame(animate);
                return;
              }

              // Case: Toggling CO2 on while OCD is visible
              if (clickedIsCO2 && !co2Visible && ocdWillBeVisible) {
                const dsPos = datasets[idxOtherPos];
                const dsNeg = datasets[idxOtherNeg];
                const dsCO2 = datasets[idxCO2Area];
                const dsCO2Line = datasets[findIdx("Cumulative CO₂ emissions")];

                // Store target CO2 values and start CO2 at zero
                const targetCO2Data = dsCO2.data.map((p) => ({ ...p }));
                for (let i = 0; i < dsCO2.data.length; i++) {
                  dsCO2.data[i].y = 0;
                  dsCO2Line.data[i].y = 0;
                }

                // Show CO2 and Total, keep OCD fill tied to CO2 during the animation so the
                // OCD wedge base rises with the CO2 line each frame.
                indicesToToggle.forEach((idx) => {
                  chart.getDatasetMeta(idx).hidden = null;
                });
                chart.getDatasetMeta(idxTotal).hidden = null;
                datasets[idxOtherPos].fill = idxCO2Area;
                datasets[idxOtherNeg].fill = idxCO2Area;
                chart.update("none");

                const duration = 400;
                const startTime = performance.now();
                const startPosData = dsPos.data.map((p) => ({ ...p }));
                const startNegData = dsNeg.data.map((p) => ({ ...p }));

                const animate = (currentTime) => {
                  const elapsed = currentTime - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  const eased = 1 - Math.pow(1 - progress, 3);

                  for (let i = 0; i < dsPos.data.length; i++) {
                    // Animate CO2 from zero to target
                    dsCO2.data[i].y = targetCO2Data[i].y * eased;
                    dsCO2Line.data[i].y = targetCO2Data[i].y * eased;
                    // Animate OCD from origin to stacked
                    dsPos.data[i].y =
                      startPosData[i].y +
                      (ocdStackedPos[i].y - startPosData[i].y) * eased;
                    dsNeg.data[i].y =
                      startNegData[i].y +
                      (ocdStackedNeg[i].y - startNegData[i].y) * eased;
                  }
                  chart.update("none");

                  if (progress < 1) {
                    requestAnimationFrame(animate);
                  } else {
                    // Switch fill to CO2 at end
                    datasets[idxOtherPos].fill = idxCO2Area;
                    datasets[idxOtherNeg].fill = idxCO2Area;
                    chart.update();
                  }
                };
                requestAnimationFrame(animate);
                return;
              }

              // Case: Toggling OCD off while CO2 is visible
              if (clickedIsOCD && ocdVisible && co2WillBeVisible) {
                const duration = 400;
                const startTime = performance.now();
                const dsPos = datasets[idxOtherPos];
                const dsNeg = datasets[idxOtherNeg];
                const startPosData = dsPos.data.map((p) => ({ ...p }));
                const startNegData = dsNeg.data.map((p) => ({ ...p }));
                const targetData = data.co2.map((v, i) => ({
                  x: data.years[i],
                  y: v,
                }));

                const animate = (currentTime) => {
                  const elapsed = currentTime - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  const eased = 1 - Math.pow(1 - progress, 3);

                  for (let i = 0; i < dsPos.data.length; i++) {
                    dsPos.data[i].y =
                      startPosData[i].y +
                      (targetData[i].y - startPosData[i].y) * eased;
                    dsNeg.data[i].y =
                      startNegData[i].y +
                      (targetData[i].y - startNegData[i].y) * eased;
                  }
                  chart.update("none");

                  if (progress < 1) {
                    requestAnimationFrame(animate);
                  } else {
                    indicesToToggle.forEach((idx) => {
                      chart.getDatasetMeta(idx).hidden = true;
                    });
                    chart.getDatasetMeta(idxTotal).hidden = true;
                    for (let i = 0; i < dsPos.data.length; i++) {
                      dsPos.data[i].y = ocdStackedPos[i].y;
                      dsNeg.data[i].y = ocdStackedNeg[i].y;
                    }
                    chart.update();
                  }
                };
                requestAnimationFrame(animate);
                return;
              }

              // Case: Toggling OCD on while CO2 is visible
              if (clickedIsOCD && !ocdVisible && co2WillBeVisible) {
                const dsPos = datasets[idxOtherPos];
                const dsNeg = datasets[idxOtherNeg];
                for (let i = 0; i < dsPos.data.length; i++) {
                  dsPos.data[i].y = data.co2[i];
                  dsNeg.data[i].y = data.co2[i];
                }
                datasets[idxOtherPos].fill = idxCO2Area;
                datasets[idxOtherNeg].fill = idxCO2Area;
                indicesToToggle.forEach((idx) => {
                  chart.getDatasetMeta(idx).hidden = null;
                });
                chart.getDatasetMeta(idxTotal).hidden = null;
                chart.update("none");
                animateOCD(true);
                return;
              }

              // Case: Toggling OCD off while CO2 is NOT visible
              if (clickedIsOCD && ocdVisible && !co2WillBeVisible) {
                animateOCD(false, () => {
                  indicesToToggle.forEach((idx) => {
                    chart.getDatasetMeta(idx).hidden = true;
                  });
                  chart.update();
                });
                return;
              }

              // Case: Toggling OCD on while CO2 is NOT visible
              if (clickedIsOCD && !ocdVisible && !co2WillBeVisible) {
                const dsPos = datasets[idxOtherPos];
                const dsNeg = datasets[idxOtherNeg];
                for (let i = 0; i < dsPos.data.length; i++) {
                  dsPos.data[i].y = 0;
                  dsNeg.data[i].y = 0;
                }
                datasets[idxOtherPos].fill = "origin";
                datasets[idxOtherNeg].fill = "origin";
                indicesToToggle.forEach((idx) => {
                  chart.getDatasetMeta(idx).hidden = null;
                });
                chart.update("none");
                animateOCD(false);
                return;
              }

              // Default behavior for other toggles
              indicesToToggle.forEach((idx) => {
                const meta = chart.getDatasetMeta(idx);
                meta.hidden =
                  meta.hidden === null ? !datasets[idx].hidden : null;
              });

              // Auto-hide Total line if either CO2 or OCD is hidden
              if (clickedIsCO2 || clickedIsOCD) {
                const finalCO2Visible = chart.isDatasetVisible(
                  findIdx("Cumulative CO₂ emissions"),
                );
                const finalOCDVisible = chart.isDatasetVisible(
                  findIdx("Other climate drivers"),
                );
                if (!finalCO2Visible || !finalOCDVisible) {
                  chart.getDatasetMeta(idxTotal).hidden = true;
                } else {
                  chart.getDatasetMeta(idxTotal).hidden = null;
                }
              }

              chart.update();
            },
            labels: {
              usePointStyle: true,
              boxWidth: 40,
              pointStyleWidth: 25,
              generateLabels: function (chart) {
                const datasets = chart.data.datasets;

                // Find datasets by label
                const findDS = (label) =>
                  datasets.find((d) => d.label === label);
                const findIdx = (label) =>
                  datasets.findIndex((d) => d.label === label);

                const items = [];

                // 1. Annual observations - small circle swatch
                const dsObsData = findDS("Annual observations");
                if (dsObsData) {
                  items.push({
                    text: "Annual observations",
                    fillStyle: dsObsData.backgroundColor,
                    strokeStyle: dsObsData.borderColor,
                    lineWidth: 0,
                    pointStyle: createCircleSwatch(
                      dsObsData.backgroundColor,
                      2,
                    ),
                    hidden: !chart.isDatasetVisible(
                      findIdx("Annual observations"),
                    ),
                    datasetIndex: findIdx("Annual observations"),
                  });
                }

                // 2. Human-induced warming - solid line
                const dsAntData = findDS("Human-induced warming");
                if (dsAntData) {
                  items.push({
                    text: "Human-induced warming",
                    fillStyle: "transparent",
                    strokeStyle: dsAntData.borderColor,
                    lineWidth: 3,
                    pointStyle: "line",
                    hidden: !chart.isDatasetVisible(
                      findIdx("Human-induced warming"),
                    ),
                    datasetIndex: findIdx("Human-induced warming"),
                  });
                }

                // 3. All human-induced drivers - dashed line
                const dsTotalData = findDS("All human-induced drivers");
                if (dsTotalData) {
                  items.push({
                    text: "All human-induced drivers",
                    fillStyle: "transparent",
                    strokeStyle: dsTotalData.borderColor,
                    lineWidth: 3,
                    lineDash: [3, 3],
                    pointStyle: "line",
                    hidden: !chart.isDatasetVisible(
                      findIdx("All human-induced drivers"),
                    ),
                    datasetIndex: findIdx("All human-induced drivers"),
                  });
                }

                // 4. Cumulative CO₂ emissions - merged: area with dashed line on top
                const dsCO2Data = findDS("Cumulative CO₂ emissions area");
                const dsCO2LineData = findDS("Cumulative CO₂ emissions");
                if (dsCO2Data && dsCO2LineData) {
                  items.push({
                    text: "Cumulative CO₂ emissions",
                    fillStyle: dsCO2Data.backgroundColor,
                    strokeStyle: dsCO2LineData.borderColor,
                    lineWidth: 0,
                    pointStyle: createAreaWithLineSwatch(
                      dsCO2Data.backgroundColor,
                      dsCO2LineData.borderColor,
                      25,
                      12,
                    ),
                    hidden: !chart.isDatasetVisible(
                      findIdx("Cumulative CO₂ emissions"),
                    ),
                    datasetIndex: findIdx("Cumulative CO₂ emissions"),
                  });
                }

                // 5. Other climate drivers - split color swatch
                const dsOtherPosData = findDS("Other climate drivers");
                const dsOtherNegData = findDS(
                  "Other climate drivers (negative)",
                );
                if (dsOtherPosData && dsOtherNegData) {
                  items.push({
                    text: "Other climate drivers",
                    fillStyle: dsOtherPosData.backgroundColor,
                    strokeStyle: "transparent",
                    lineWidth: 0,
                    pointStyle: createSplitColorSwatch(
                      dsOtherNegData.backgroundColor,
                      dsOtherPosData.backgroundColor,
                      25,
                      12,
                    ),
                    hidden: !chart.isDatasetVisible(
                      findIdx("Other climate drivers"),
                    ),
                    datasetIndex: findIdx("Other climate drivers"),
                  });
                }

                return items;
              },
            },
          },
          tooltip: {
            position: "cursor",
            callbacks: {
              title: (tooltipItems) => {
                return tooltipItems[0].parsed.x;
              },
              label: (context) => {
                let label = context.dataset.label || "";
                // Hide datasets that shouldn't appear in tooltip
                if (
                  label.includes("Range") ||
                  label.includes("area") ||
                  label.includes("(negative)")
                ) {
                  return null;
                }

                // SHOW ISOLATED VALUE FOR "OTHER"
                if (label === "Other climate drivers") {
                  const val = data.other[context.dataIndex];
                  return label + ": " + val.toFixed(3);
                }

                let value = context.parsed.y;
                let str = label + ": " + value.toFixed(3);

                if (label === "Annual observations") {
                  const errDS = context.chart.data.datasets.find(
                    (d) => d.label === "Observations Range",
                  );
                  if (errDS) {
                    const point = errDS.data[context.dataIndex];
                    if (point && Array.isArray(point.y)) {
                      const low = point.y[0].toFixed(3);
                      const high = point.y[1].toFixed(3);
                      str += ` [${low} - ${high}]`;
                    }
                  }
                }
                return str;
              },
              labelColor: (context) => {
                const label = context.dataset.label || "";
                // Dynamic color for "Other climate drivers" based on value
                if (label === "Other climate drivers") {
                  const val = data.other[context.dataIndex];
                  const color =
                    val >= 0
                      ? withAlpha(colorNonCO2, 0.6)
                      : withAlpha(colorNonCO2Neg, 0.6);
                  return {
                    borderColor: color,
                    backgroundColor: color,
                  };
                }
                // Default: use dataset colors
                return {
                  borderColor:
                    context.dataset.borderColor ||
                    context.dataset.backgroundColor,
                  backgroundColor:
                    context.dataset.backgroundColor ||
                    context.dataset.borderColor,
                };
              },
            },
          },
        },
      },
    };

    const myChart = new Chart(ctx, config);
    if (!logoImg.complete) {
      logoImg.onload = () => myChart.update();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
