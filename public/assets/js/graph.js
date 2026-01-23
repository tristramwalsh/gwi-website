(function () {
  // Import shared utilities
  const { CONFIG, withAlpha, parseGwiData, parseHadcrutData, verticalHoverLinePlugin, createLogoPlugin } = window.GWIUtils;
  const BASELINE_PERIOD_START = CONFIG.BASELINE_PERIOD_START;
  const BASELINE_PERIOD_END = CONFIG.BASELINE_PERIOD_END;

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
        const gwiData = parseGwiData(gwiText, { requiredVars: ["Nat", "Ant", "Tot"] });
        // Use shared HadCRUT parser
        const hadcrutData = parseHadcrutData(hadcrutText);

        plotGraph(gwiData, hadcrutData);
      })
      .catch((err) => window.GWIUtils.handleError("Graph data loading", err));
  }

  // --- Graph Functions (Adapted from new_graph.js) ---

  function plotGraph(gwiData, hadcrutData) {
    const ctx = document.getElementById("climate-chart").getContext("2d");
    const style = getComputedStyle(document.documentElement);

    const datasets = [];

    function addDatasets(name, color, data, showPlume = true) {
      if (showPlume) {
        // Upper bound (95%)
        datasets.push({
          label: name + " 95%",
          data: data.p95,
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
          data: data.p5,
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
        data: data.p50,
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

    addDatasets("Natural", colorNat, gwiData.Nat, true);
    addDatasets("Human-induced", colorAnt, gwiData.Ant, true);
    addDatasets("Combined response", colorTot, gwiData.Tot, false);

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
            y: data.p95[i],
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
            y: data.p5[i],
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
          y: data.p50[i],
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

    addParsedDatasets("Natural", colorNat, gwiData.Nat, true, false);
    addParsedDatasets("Human-induced", colorAnt, gwiData.Ant, true, false);
    addParsedDatasets("Combined response", colorTot, gwiData.Tot, true, true);

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

    // Calculate dynamic Y-axis bounds
    const allYValues = [];
    // Add GWI data
    ["Nat", "Ant", "Tot"].forEach((dataset) => {
      if (gwiData[dataset]) {
        allYValues.push(...gwiData[dataset].p5, ...gwiData[dataset].p95);
      }
    });
    // Add HadCRUT data
    allYValues.push(...hadcrutData.p5, ...hadcrutData.p95);

    const minYValue = Math.min(...allYValues);
    const maxYValue = Math.max(...allYValues);
    const yRange = maxYValue - minYValue;
    // Padding removed to tightly bound axis to nearest 0.5 step
    const yMin = Math.floor(minYValue * 2) / 2;
    const yMax = Math.ceil(maxYValue * 2) / 2;

    // Use shared logo plugin
    const logoPlugin = createLogoPlugin("assets/img/eci-oxford-blue-text-RGB.png");

    const config = {
      type: "line",
      data: {
        datasets: datasets,
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
            min: yMin,
            max: yMax,
            grid: {
              display: true,
            },
            ticks: {
              stepSize: 0.5,
            },
            title: {
              display: true,
              text: `Temperature Anomaly (°C) relative to ${BASELINE_PERIOD_START}-${BASELINE_PERIOD_END}`,
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
    // Handle logo image load
    const logoImg = logoPlugin.getImage();
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
