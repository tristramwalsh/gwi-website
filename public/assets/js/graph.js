(function () {
  function init() {
    // Initialize Graph (Logic adapted from new_graph.js)
    Promise.all([
      fetch("assets/data/gwi/gwi_timeseries.csv").then((response) =>
        response.text(),
      ),
      fetch(
        "assets/data/temp/HadCRUT.5.0.2.0.analysis.ensemble_series.global.annual.csv",
      ).then((response) => response.text()),
    ])
      .then(([gwiText, hadcrutText]) => {
        const gwiData = parseGwiData(gwiText);
        const hadcrutData = parseHadcrutData(hadcrutText);

        plotGraph(gwiData, hadcrutData);
      })
      .catch((err) => console.error("Error loading graph data:", err));
  }

  // --- Graph Functions (Adapted from new_graph.js) ---

  function parseGwiData(csvText) {
    const lines = csvText
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.startsWith("#"));
    const dataLines = lines.slice(3); // Skip header lines
    const years = [];
    const ant = { 5: [], 50: [], 95: [] };
    const nat = { 5: [], 50: [], 95: [] };
    const tot = { 5: [], 50: [], 95: [] };

    dataLines.forEach((line) => {
      const parts = line.split(",");
      if (parts.length < 26) return;

      years.push(parts[0]);

      nat[5].push(parseFloat(parts[6]));
      nat[95].push(parseFloat(parts[9]));
      nat[50].push(parseFloat(parts[10]));

      ant[5].push(parseFloat(parts[16]));
      ant[95].push(parseFloat(parts[19]));
      ant[50].push(parseFloat(parts[20]));

      tot[5].push(parseFloat(parts[21]));
      tot[95].push(parseFloat(parts[24]));
      tot[50].push(parseFloat(parts[25]));
    });

    return { years, nat, ant, tot };
  }

  function parseHadcrutData(csvText) {
    const lines = csvText.split("\n").filter((line) => line.trim() !== "");
    // Header is line 0
    const dataLines = lines.slice(1);

    const years = [];
    const p5 = [];
    const p50 = [];
    const p95 = [];
    const baselineValues = [];

    dataLines.forEach((line) => {
      const parts = line.split(",");
      if (parts.length < 203) return; // Time + 2 metadata + 200 realizations

      const year = parseInt(parts[0]);
      years.push(year);

      // Realizations are from index 3 to 202 (200 columns)
      // Need to parse them all to sort find percentiles
      const realizations = parts
        .slice(3, 203)
        .map((v) => parseFloat(v))
        .sort((a, b) => a - b);

      const val5 = realizations[9]; // 10th value
      const val50 = (realizations[99] + realizations[100]) / 2;
      const val95 = realizations[189]; // 190th value

      p5.push(val5);
      p50.push(val50);
      p95.push(val95);

      if (year >= 1850 && year <= 1900) {
        baselineValues.push(val50);
      }
    });

    // Calculate baseline (average of 50th percentiles from 1850-1900)
    let baseline = 0;
    if (baselineValues.length > 0) {
      baseline =
        baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
    }

    // Subtract baseline from all values to get anomaly relative to 1850-1900
    const p5_adj = p5.map((v) => v - baseline);
    const p50_adj = p50.map((v) => v - baseline);
    const p95_adj = p95.map((v) => v - baseline);

    return { years, p5: p5_adj, p50: p50_adj, p95: p95_adj };
  }

  function plotGraph(gwiData, hadcrutData) {
    const ctx = document.getElementById("climate-chart").getContext("2d");
    const style = getComputedStyle(document.documentElement);

    const withAlpha = (color, alpha) => {
      const match = (color || "").match(
        /rgb\s*a?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
      );
      if (!match) return color;
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
    };

    const datasets = [];

    function addDatasets(name, color, data, showPlume = true) {
      if (showPlume) {
        // Upper bound (95%)
        datasets.push({
          label: name + " 95%",
          data: data[95],
          borderColor: "transparent",
          backgroundColor: "transparent",
          pointRadius: 0,
          fill: false,
          borderWidth: 0,
          order: 2,
          hidden: true, // Hide from legend
        });

        // Lower bound (5%) - fill to upper
        datasets.push({
          label: name + " 5%",
          data: data[5],
          borderColor: "transparent",
          backgroundColor: withAlpha(color, 0.2),
          pointRadius: 0,
          fill: "-1", // Fill to previous dataset
          borderWidth: 0,
          order: 2,
          hidden: true, // Hide from legend
        });
      }

      // Median (50%)
      datasets.push({
        label: name,
        data: data[50],
        borderColor: color,
        backgroundColor: color,
        fill: false,
        borderWidth: 2,
        pointRadius: 0,
        order: 1,
      });
    }

    // Colors fetched from CSS variables
    const colorNat = style.getPropertyValue("--color-plot-natural").trim();
    const colorAnt = style
      .getPropertyValue("--color-plot-anthropogenic")
      .trim();
    const colorTot = style.getPropertyValue("--color-plot-total").trim();
    const colorObs = style.getPropertyValue("--color-plot-observations").trim();
    const colorObsErr = style.getPropertyValue("--color-plot-obs-err").trim();

    addDatasets("Natural", colorNat, gwiData.nat, true);
    addDatasets("Human-induced", colorAnt, gwiData.ant, true);
    addDatasets("Combined response", colorTot, gwiData.tot, false);

    // HadCRUT5 Line
    datasets.push({
      label: "Annual observations",
      data: hadcrutData.p50,
      borderColor: colorObs,
      backgroundColor: colorObs,
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
      order: 0,
    });

    // HadCRUT Error Bars (Floating Bar)
    // Align data with years. HadCRUT years might differ slightly or be subset/superset.
    // However, Chart.js matches by index if labels are shared.
    // Problem: gwiData.years is the labels. hadcrutData.years might be different.
    // We should use parsed x/y to be safe and accurate.

    // Let's restructure data to {x, y} format for Chart.js to handle x-axis matching automatically.

    // Clear datasets and rebuild with parsed format
    datasets.length = 0;

    function addParsedDatasets(
      name,
      color,
      data,
      showPlume = true,
      hidden = false,
    ) {
      if (showPlume) {
        // Upper
        datasets.push({
          label: name + " 95%",
          data: gwiData.years.map((y, i) => ({
            x: parseFloat(y),
            y: data[95][i],
          })),
          borderColor: "transparent",
          backgroundColor: "transparent",
          pointRadius: 0,
          pointHoverRadius: 0, // Disable hover dot
          fill: false,
          borderWidth: 0,
          order: 2,
          legend: { display: false },
          tooltip: { enabled: false }, // Hide from tooltips
          hidden: hidden,
        });
        // Lower
        datasets.push({
          label: name + " 5%",
          data: gwiData.years.map((y, i) => ({
            x: parseFloat(y),
            y: data[5][i],
          })),
          borderColor: "transparent",
          backgroundColor: withAlpha(color, 0.2),
          pointRadius: 0,
          pointHoverRadius: 0, // Disable hover dot
          fill: "-1",
          borderWidth: 0,
          order: 2,
          legend: { display: false },
          tooltip: { enabled: false },
          hidden: hidden,
        });
      }
      // Median
      datasets.push({
        label: name,
        data: gwiData.years.map((y, i) => ({
          x: parseFloat(y),
          y: data[50][i],
        })),
        borderColor: color,
        backgroundColor: color,
        fill: false,
        borderWidth: 2,
        pointRadius: 0,
        order: 1,
        hidden: hidden,
      });
    }

    addParsedDatasets("Natural", colorNat, gwiData.nat, true, false);
    addParsedDatasets("Human-induced", colorAnt, gwiData.ant, true, false);
    addParsedDatasets("Combined response", colorTot, gwiData.tot, true, true);

    // HadCRUT Dots
    datasets.push({
      label: "Observations",
      data: hadcrutData.years.map((y, i) => ({ x: y, y: hadcrutData.p50[i] })),
      borderColor: colorObs,
      backgroundColor: colorObs,
      borderWidth: 0,
      pointRadius: 2,
      showLine: false,
      fill: false,
      order: 0,
    });

    // HadCRUT Error Bars
    // Floating bars: [min, max]
    datasets.push({
      label: "Observations Error",
      data: hadcrutData.years.map((y, i) => ({
        x: y,
        y: [hadcrutData.p5[i], hadcrutData.p95[i]],
      })),
      type: "bar",
      backgroundColor: colorObsErr, // Error bar color
      barThickness: 1,
      order: 0,
      grouped: false, // Don't group with other bars (if any)
      legend: { display: false }, // Hide from legend
      tooltip: { enabled: false },
      hoverBackgroundColor: colorObsErr, // Don't change color on hover
    });

    const minYear = Math.min(...gwiData.years.map((y) => parseFloat(y)));
    const maxYear = Math.max(...gwiData.years.map((y) => parseFloat(y)));

    // Custom Positioner: Follows mouse Y, locks to data X
    Chart.Tooltip.positioners.cursor = function (elements, eventPosition) {
      if (!elements.length) return false;
      return {
        x: elements[0].element.x,
        y: eventPosition.y,
      };
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
          ctx.strokeStyle = "rgba(0,0,0,0.1)"; // Light grey like gridlines
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
        datasets: datasets,
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
            max: maxYear + 2,
            offset: false,
            title: { display: false },
            grid: {
              display: false,
            },
            afterBuildTicks: function (axis) {
              const dataMax = Math.max(
                ...gwiData.years.map((y) => parseFloat(y)),
              );
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
              callback: function (value, index, values) {
                return value.toString().replace(",", "");
              },
            },
          },
          y: {
            min: -0.5,
            max: 2.0,
            grid: {
              display: true,
            },
            ticks: {
              stepSize: 0.5,
            },
            title: {
              display: true,
              text: "Temperature Anomaly (°C) relative to 1850-1900",
            },
          },
        },
        plugins: {
          title: {
            display: true,
            text: "Global Warming Index",
            font: { size: 16, family: "Roboto, Open Sans, sans-serif" },
          },
          legend: {
            position: "bottom",
            onClick: function (e, legendItem, legend) {
              const chart = legend.chart;
              const clickedLabel =
                chart.data.datasets[legendItem.datasetIndex].label;
              const datasets = chart.data.datasets;

              // Find all related datasets for the clicked category
              const indicesToToggle = [];
              datasets.forEach((ds, idx) => {
                const label = ds.label;

                if (
                  clickedLabel === "Observations" &&
                  label.startsWith("Observations")
                ) {
                  indicesToToggle.push(idx);
                } else if (
                  clickedLabel === "Natural" &&
                  (label === "Natural" || label.startsWith("Natural "))
                ) {
                  indicesToToggle.push(idx);
                } else if (
                  clickedLabel === "Human-induced" &&
                  (label === "Human-induced" ||
                    label.startsWith("Human-induced "))
                ) {
                  indicesToToggle.push(idx);
                } else if (
                  clickedLabel === "Combined response" &&
                  (label === "Combined response" ||
                    label.startsWith("Combined response "))
                ) {
                  indicesToToggle.push(idx);
                } else if (label === clickedLabel) {
                  indicesToToggle.push(idx);
                }
              });

              // Toggle all related datasets
              indicesToToggle.forEach((idx) => {
                const meta = chart.getDatasetMeta(idx);
                meta.hidden =
                  meta.hidden === null ? !datasets[idx].hidden : null;
              });

              chart.update();
            },
            labels: {
              usePointStyle: true,
              pointStyle: "rect",
              boxWidth: 10,
              boxHeight: 10,
              filter: function (item, chart) {
                // Hide 95%, 5% and Error bars from legend
                return !item.text.includes("%") && !item.text.includes("Error");
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

                // Filter out helper datasets from showing their own tooltip entry
                if (
                  label.includes(" 95%") ||
                  label.includes(" 5%") ||
                  label === "Observations Error"
                ) {
                  return null;
                }

                let value = context.parsed.y;
                let str = label + ": " + value.toFixed(3) + "°C";

                // 1. Handle "Observations" (Look for "Observations Error" dataset)
                if (label === "Observations") {
                  // The Error dataset is usually right after the Obs dataset or we find it by name
                  const errDS = context.chart.data.datasets.find(
                    (d) => d.label === "Observations Error",
                  );
                  if (errDS) {
                    // Error dataset data is objects {x, y: [low, high]}
                    const point = errDS.data[context.dataIndex];
                    if (point && Array.isArray(point.y)) {
                      const low = point.y[0].toFixed(3);
                      const high = point.y[1].toFixed(3);
                      str += ` [${low} - ${high}]`;
                    }
                  }
                }
                // 2. Handle Datasets with Plumes (Look for 5% and 95%)
                else {
                  // Assumption: The structure is consistent.
                  // We can search for datasets with name + " 5%" and name + " 95%"
                  const lowDS = context.chart.data.datasets.find(
                    (d) => d.label === label + " 5%",
                  );
                  const highDS = context.chart.data.datasets.find(
                    (d) => d.label === label + " 95%",
                  );

                  if (lowDS && highDS) {
                    const lowVal = lowDS.data[context.dataIndex].y; // stored as {x,y}
                    const highVal = highDS.data[context.dataIndex].y;
                    if (lowVal !== undefined && highVal !== undefined) {
                      str += ` [${lowVal.toFixed(3)} - ${highVal.toFixed(3)}]`;
                    }
                  }
                }

                return str;
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

  // Start everything when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
