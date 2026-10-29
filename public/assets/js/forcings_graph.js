(function () {
  // Import shared utilities
  const { CONFIG, withAlpha, verticalHoverLinePlugin, createLogoPlugin, parseGwiData, parseHadcrutData, fetchHadcrutCsv } = window.GWIUtils;
  const BASELINE_PERIOD_START = CONFIG.BASELINE_PERIOD_START;
  const BASELINE_PERIOD_END = CONFIG.BASELINE_PERIOD_END;
  const SECONDS_PER_YEAR = 365.2425 * 24 * 60 * 60;

  function init() {
    Promise.all([
      fetch("assets/data/gwi/gwi_timeseries.csv").then((r) => r.text()),
      fetch("assets/data/erf/erf_timeseries.csv").then((r) => r.text()),
      fetch("assets/data/emissions_co2/cumulative-co2-including-land.csv").then(
        (r) => r.text(),
      ),
      fetchHadcrutCsv(),
      // Emissions rate (as used by the live counter); optional, only needed
      // to extrapolate if the emissions data ends before the GWI data
      fetch("assets/data/current_emissions_state.json")
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([gwiText, erfText, co2Text, hadcrutText, co2State]) => {
        const data = processData(gwiText, erfText, co2Text, hadcrutText, co2State);
        plotGraph(data);
      })
      .catch((err) => window.GWIUtils.handleError("Forcings graph data loading", err));
  }

  function processData(gwiText, erfText, co2Text, hadcrutText, co2State) {
    // 1. GWI Parsing (Get Ant-50)
    // Use shared parser
    const gwiDataRaw = parseGwiData(gwiText, { requiredVars: ["Ant"] });
    
    const yearMap = new Map(); // Use map to sync data

    // Populate gwi data
    gwiDataRaw.years.forEach((year, i) => {
      const val = gwiDataRaw.Ant.p50[i];
      if (!isNaN(val)) {
        yearMap.set(year, { ant: val });
      }
    });

    // 2. ERF Parsing (Get Ant-50 and co2-50 to calc "Other")
    const erfDataRaw = parseGwiData(erfText, { requiredVars: ["Ant", "co2"] });

    // The slow term integrates non-CO2 forcing over the whole ERF record, so
    // sum over every ERF year, not just those that overlap the GWI data
    let cumulativeOther = 0;
    erfDataRaw.years.forEach((year, i) => {
      const ant = erfDataRaw.Ant.p50[i];
      const co2 = erfDataRaw.co2.p50[i];
      if (isNaN(ant) || isNaN(co2)) return;

      // Other human forcings = Ant - co2
      const other = ant - co2;
      cumulativeOther += other;
      if (yearMap.has(year)) {
        const d = yearMap.get(year);
        // Fast response: Delta F_N
        d.otherFast = other;
        // Slow response: rho * integral of F_N dt (annual data, so dt = 1 yr),
        // in W/m2 so that it shares the forcing axis with Delta F_N
        d.otherSlow = CONFIG.RACF * cumulativeOther;
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

    const co2ByYear = new Map();
    const co2DataLines = co2Lines.slice(1);
    co2DataLines.forEach((line) => {
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // regex split for CSV
      if (parts[entityIdx] === "World") {
        const year = parseFloat(parts[yearIdx]);
        // Convert to Trillion Tonnes (TtCO2)
        const val = parseFloat(parts[valIdx]) / 1e12;
        co2ByYear.set(year, val);
        if (yearMap.has(year)) {
          yearMap.get(year).co2 = val;
        }
      }
    });

    // 3b. Extrapolate cumulative emissions for any GWI years beyond the end of
    // the emissions data (emissions are reported with a lag). Uses the same
    // rate as the live counter, falling back to the last annual increment.
    const co2Extrapolated = new Set();
    const lastCo2Year = Math.max(...co2ByYear.keys());
    const lastCo2Val = co2ByYear.get(lastCo2Year);
    const ratePerYear = co2State
      ? (co2State.co2_emissions_rate_per_sec_tonnes * SECONDS_PER_YEAR) / 1e12
      : lastCo2Val - co2ByYear.get(lastCo2Year - 1);
    yearMap.forEach((d, year) => {
      if (year > lastCo2Year && !isNaN(ratePerYear)) {
        d.co2 = lastCo2Val + ratePerYear * (year - lastCo2Year);
        co2Extrapolated.add(year);
      }
    });

    // 4. HadCRUT Parsing (Observed Temp), truncated to the GWI end year to
    // drop any partial current year
    const hadcrutRaw = parseHadcrutData(hadcrutText, {
      maxYear: gwiDataRaw.years[gwiDataRaw.years.length - 1],
    });
    const hadData = {
      years: hadcrutRaw.years,
      val: hadcrutRaw.p50,
      error_upper: hadcrutRaw.p95, // Absolute value for bar chart
      error_lower: hadcrutRaw.p5, // Absolute value for bar chart
    };

    // consolidate final arrays for plotting
    const years = [];
    const ant = [];
    const co2 = [];
    const otherFast = [];
    const otherSlow = [];
    const co2IsExtrapolated = [];

    // Iterate sorted years
    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);

    sortedYears.forEach((y) => {
      const d = yearMap.get(y);
      if (d.ant !== undefined) {
        years.push(y);
        ant.push(d.ant);
        co2.push(d.co2 || 0);
        otherFast.push(d.otherFast || 0);
        otherSlow.push(d.otherSlow || 0);
        co2IsExtrapolated.push(co2Extrapolated.has(y));
      }
    });

    return { years, ant, co2, otherFast, otherSlow, co2IsExtrapolated, hadData };
  }

  function plotGraph(data) {
    const ctx = document.getElementById("forcings-chart").getContext("2d");
    const style = getComputedStyle(document.documentElement);

    // Canvas helper functions for custom legend swatches (kept local as only used here)
    const createCircleSwatch = (color, radius) => {
      const size = radius * 2 + 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctxSwatch = canvas.getContext("2d");
      ctxSwatch.beginPath();
      ctxSwatch.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
      ctxSwatch.fillStyle = color;
      ctxSwatch.fill();
      return canvas;
    };

    const createSplitColorSwatch = (colorLeft, colorRight, width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctxSwatch = canvas.getContext("2d");
      // Left half
      ctxSwatch.fillStyle = colorLeft;
      ctxSwatch.fillRect(0, 0, width / 2, height);
      // Right half
      ctxSwatch.fillStyle = colorRight;
      ctxSwatch.fillRect(width / 2, 0, width / 2, height);
      return canvas;
    };

    const createAreaWithLineSwatch = (fillColor, lineColor, width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctxSwatch = canvas.getContext("2d");
      // Fill area
      ctxSwatch.fillStyle = fillColor;
      ctxSwatch.fillRect(0, 0, width, height);
      // Dashed line on top
      ctxSwatch.strokeStyle = lineColor;
      ctxSwatch.lineWidth = 2;
      ctxSwatch.setLineDash([3, 3]);
      ctxSwatch.beginPath();
      ctxSwatch.moveTo(0, 2);
      ctxSwatch.lineTo(width, 2);
      ctxSwatch.stroke();
      return canvas;
    };

    // Calculate Scaling Ratio between the forcing (y1) and temperature (y)
    // axes: least-squares fit through the origin of the full driver stack
    // (CO2 + fast + slow) to human-induced warming over the most recent
    // years. Fit with all components on, and keep fixed as they are toggled.
    const FIT_WINDOW_YEARS = 100;
    const fitStart = data.years[data.years.length - 1] - FIT_WINDOW_YEARS;
    let sumStackAnt = 0;
    let sumAntSq = 0;
    data.years.forEach((y, i) => {
      if (y <= fitStart) return;
      const stack = data.co2[i] + data.otherFast[i] + data.otherSlow[i];
      sumStackAnt += stack * data.ant[i];
      sumAntSq += data.ant[i] * data.ant[i];
    });
    const ratio = sumStackAnt / sumAntSq;

    // Calculate dynamic Y-axis bounds
    const allYTempValues = [
      ...data.ant,
      ...data.hadData.val,
      ...data.hadData.error_upper,
      ...data.hadData.error_lower,
    ];
    const minYTemp = Math.min(...allYTempValues);
    const maxYTemp = Math.max(...allYTempValues);
    const yTempRange = maxYTemp - minYTemp;
    // Padding removed to tightly bound axis to nearest 0.5 step
    const yMinTemp = Math.floor(minYTemp * 2) / 2;
    const yMaxTemp = Math.ceil(maxYTemp * 2) / 2;

    // Y1 axis (forcings) should scale with ratio
    const yMinForcing = yMinTemp * ratio;
    const yMaxForcing = yMaxTemp * ratio;

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
    // The non-CO2 wedge combines the fast (Delta F_N) and slow (Seshadri)
    // components, which can be toggled independently from the legend. The
    // wedge is shown while either component is on.
    const visible = { co2: true, fast: true, slow: true };
    const ocdVisible = (state) => state.fast || state.slow;
    // The total line is the full model; the slow term is a second-order
    // correction, so the line is also shown without it, but not without fast
    const totalVisible = (state) => state.co2 && state.fast;

    const otherFor = (state, i) =>
      (state.fast ? data.otherFast[i] : 0) +
      (state.slow ? data.otherSlow[i] : 0);

    // Target y-values for every animated dataset given a visibility state.
    // Hidden components collapse to zero, so they animate in and out.
    const targetsFor = (state) => {
      const co2 = [];
      const pos = [];
      const neg = [];
      const total = [];
      data.years.forEach((y, i) => {
        const base = state.co2 ? data.co2[i] : 0;
        const other = otherFor(state, i);
        co2.push(base);
        pos.push(base + Math.max(0, other));
        neg.push(base + Math.min(0, other));
        total.push(
          data.co2[i] + otherFor({ fast: true, slow: state.slow }, i),
        );
      });
      return { co2, pos, neg, total };
    };
    const initialTargets = targetsFor(visible);

    // Positive Non-CO2
    const dsOtherPos = {
      label: "Non-CO2 drivers",
      data: data.years.map((y, i) => ({ x: y, y: initialTargets.pos[i] })),
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
      label: "Non-CO2 drivers (negative)",
      data: data.years.map((y, i) => ({ x: y, y: initialTargets.neg[i] })),
      backgroundColor: withAlpha(colorNonCO2Neg, 0.6),
      borderColor: "transparent",
      fill: 0, // Fill to dsCO2 (will be updated dynamically)
      pointRadius: 0,
      yAxisID: "y1",
      order: 3,
    };

    // 2.5 Total Anthropogenic Forcing (Line)
    const dsTotal = {
      label: "All human-induced drivers",
      data: data.years.map((y, i) => ({ x: y, y: initialTargets.total[i] })),
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

    // Use shared logo plugin
    const logoPlugin = createLogoPlugin("assets/img/eci-oxford-blue-text-RGB.png");

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
      plugins: [verticalHoverLinePlugin, logoPlugin],
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
            min: BASELINE_PERIOD_START,
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
            min: yMinTemp,
            max: yMaxTemp,
            ticks: {
              stepSize: 0.5,
            },
            title: {
              display: true,
              text: `GMST Warming relative to ${BASELINE_PERIOD_START}-${BASELINE_PERIOD_END} (°C)`,
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
            min: yMinForcing,
            max: yMaxForcing,
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
              const datasets = chart.data.datasets;

              // Helper to find dataset index by label
              const findIdx = (label) =>
                datasets.findIndex((d) => d.label === label);

              const idxCO2Area = findIdx("Cumulative CO₂ emissions area");
              const idxCO2Line = findIdx("Cumulative CO₂ emissions");
              const idxOtherPos = findIdx("Non-CO2 drivers");
              const idxOtherNeg = findIdx("Non-CO2 drivers (negative)");
              const idxTotal = findIdx("All human-induced drivers");

              // CO2 and the non-CO2 components are driven by `visible` and
              // animate between stacked positions; everything else toggles
              const clickedLabel =
                chart.data.datasets[legendItem.datasetIndex].label;
              let key = legendItem.component;
              if (!key && clickedLabel === "Cumulative CO₂ emissions") {
                key = "co2";
              }

              if (!key) {
                const indicesToToggle = datasets
                  .map((ds, idx) => idx)
                  .filter((idx) => {
                    const label = datasets[idx].label;
                    return clickedLabel === "Annual observations"
                      ? label === "Annual observations" ||
                          label.includes("Observations")
                      : label === clickedLabel;
                  });
                indicesToToggle.forEach((idx) => {
                  const meta = chart.getDatasetMeta(idx);
                  meta.hidden =
                    meta.hidden === null ? !datasets[idx].hidden : null;
                });
                chart.update();
                return;
              }

              const from = { ...visible };
              visible[key] = !visible[key];
              const to = { ...visible };
              const targets = targetsFor(to);

              const setHidden = (idx, hidden) => {
                chart.getDatasetMeta(idx).hidden = hidden ? true : null;
              };

              // Show anything visible at either end of the animation, so
              // that it can animate in or out. Keep the wedge filled to the
              // CO2 area while that is drawn, so its base follows the CO2 line.
              const co2Shown = from.co2 || to.co2;
              setHidden(idxCO2Area, !co2Shown);
              setHidden(idxCO2Line, !co2Shown);
              setHidden(idxOtherPos, !(ocdVisible(from) || ocdVisible(to)));
              setHidden(idxOtherNeg, !(ocdVisible(from) || ocdVisible(to)));
              setHidden(idxTotal, !(totalVisible(from) && totalVisible(to)));
              const fillTarget = co2Shown ? idxCO2Area : "origin";
              datasets[idxOtherPos].fill = fillTarget;
              datasets[idxOtherNeg].fill = fillTarget;

              const animated = [
                [datasets[idxCO2Area], targets.co2],
                [datasets[idxCO2Line], targets.co2],
                [datasets[idxOtherPos], targets.pos],
                [datasets[idxOtherNeg], targets.neg],
                [datasets[idxTotal], targets.total],
              ].map(([ds, target]) => ({
                ds,
                start: ds.data.map((p) => p.y),
                target,
              }));

              const duration = 400;
              const startTime = performance.now();
              const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);

                animated.forEach(({ ds, start, target }) => {
                  for (let i = 0; i < ds.data.length; i++) {
                    ds.data[i].y = start[i] + (target[i] - start[i]) * eased;
                  }
                });
                chart.update("none");

                if (progress < 1) {
                  requestAnimationFrame(animate);
                } else {
                  setHidden(idxCO2Area, !to.co2);
                  setHidden(idxCO2Line, !to.co2);
                  setHidden(idxOtherPos, !ocdVisible(to));
                  setHidden(idxOtherNeg, !ocdVisible(to));
                  setHidden(idxTotal, !totalVisible(to));
                  datasets[idxOtherPos].fill = to.co2 ? idxCO2Area : "origin";
                  datasets[idxOtherNeg].fill = to.co2 ? idxCO2Area : "origin";
                  chart.update();
                }
              };
              requestAnimationFrame(animate);
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

                // 5. Non-CO2 drivers - split color swatch, one item per
                // component; both components share the one wedge
                const dsOtherPosData = findDS("Non-CO2 drivers");
                const dsOtherNegData = findDS(
                  "Non-CO2 drivers (negative)",
                );
                if (dsOtherPosData && dsOtherNegData) {
                  [
                    ["fast", "Non-CO2 drivers (fast)"],
                    ["slow", "Non-CO2 drivers (slow)"],
                  ].forEach(([component, text]) => {
                    items.push({
                      text,
                      component,
                      fillStyle: dsOtherPosData.backgroundColor,
                      strokeStyle: "transparent",
                      lineWidth: 0,
                      pointStyle: createSplitColorSwatch(
                        dsOtherNegData.backgroundColor,
                        dsOtherPosData.backgroundColor,
                        25,
                        12,
                      ),
                      hidden: !visible[component],
                      datasetIndex: findIdx("Non-CO2 drivers"),
                    });
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
                // Hide datasets that shouldn't appear in tooltip. The total
                // line is scaled to compare shape only, so its values aren't
                // meaningful on either axis
                if (
                  label.includes("Range") ||
                  label.includes("area") ||
                  label.includes("(negative)") ||
                  label === "All human-induced drivers"
                ) {
                  return null;
                }

                // SHOW ISOLATED VALUE FOR "OTHER", with its components
                if (label === "Non-CO2 drivers") {
                  const i = context.dataIndex;
                  const parts = [];
                  if (visible.fast) {
                    parts.push("fast " + data.otherFast[i].toFixed(3));
                  }
                  if (visible.slow) {
                    parts.push("slow " + data.otherSlow[i].toFixed(3));
                  }
                  return (
                    label +
                    ": " +
                    otherFor(visible, i).toFixed(3) +
                    " W/m² (" +
                    parts.join(", ") +
                    ")"
                  );
                }

                const unit =
                  label === "Cumulative CO₂ emissions" ? "TtCO₂" : "°C";
                let value = context.parsed.y;
                let str = label + ": " + value.toFixed(3) + " " + unit;

                if (
                  label === "Cumulative CO₂ emissions" &&
                  data.co2IsExtrapolated[context.dataIndex]
                ) {
                  str += " (extrapolated)";
                }

                if (label === "Annual observations") {
                  const errDS = context.chart.data.datasets.find(
                    (d) => d.label === "Observations Range",
                  );
                  if (errDS) {
                    const point = errDS.data[context.dataIndex];
                    if (point && Array.isArray(point.y)) {
                      const low = point.y[0].toFixed(3);
                      const high = point.y[1].toFixed(3);
                      str += ` [${low} - ${high} °C]`;
                    }
                  }
                }
                return str;
              },
              labelColor: (context) => {
                const label = context.dataset.label || "";
                // Dynamic color for "Non-CO2 drivers" based on value
                if (label === "Non-CO2 drivers") {
                  const val = otherFor(visible, context.dataIndex);
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
    // Handle logo image load
    const logoImg = logoPlugin.getImage();
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
