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
    const traces = [];

    function createTraces(name, color, data, showPlume = true) {
      if (showPlume) {
        // Upper bound (95%)
        traces.push({
          x: gwiData.years,
          y: data[95],
          mode: "lines",
          line: { width: 0 },
          marker: { color: color },
          showlegend: false,
          hoverinfo: "skip",
          name: name + " 95%",
        });

        // Lower bound (5%) - fill to upper
        traces.push({
          x: gwiData.years,
          y: data[5],
          mode: "lines",
          line: { width: 0 },
          marker: { color: color },
          fill: "tonexty",
          fillcolor: color.replace("rgb", "rgba").replace(")", ", 0.2)"),
          showlegend: false,
          hoverinfo: "skip",
          name: name + " 5%",
        });
      }

      // Median (50%)
      traces.push({
        x: gwiData.years,
        y: data[50],
        mode: "lines",
        line: { color: color, width: 2 },
        name: name,
      });
    }

    // Colors matching the description
    const colorNat = "rgb(0, 0, 255)"; // Blue
    const colorAnt = "rgb(255, 0, 0)"; // Red
    const colorTot = "rgb(128, 0, 128)"; // Purple

    createTraces("Natural", colorNat, gwiData.nat);
    createTraces("Human-induced", colorAnt, gwiData.ant);
    createTraces("Combined response", colorTot, gwiData.tot, false);

    // Add HadCRUT5 Line
    traces.push({
      x: hadcrutData.years,
      y: hadcrutData.p50,
      mode: "lines",
      line: { color: "black", width: 1 },
      name: "Annual observations",
      error_y: {
        type: "data",
        symmetric: false,
        array: hadcrutData.p95.map((v, i) => v - hadcrutData.p50[i]),
        arrayminus: hadcrutData.p50.map((v, i) => v - hadcrutData.p5[i]),
        color: "black",
        thickness: 1,
        width: 0,
      },
    });

    const minYear = Math.min(...gwiData.years.map((y) => parseFloat(y)));
    const maxYear = Math.max(...gwiData.years.map((y) => parseFloat(y)));

    const layout = {
      title: "Global Warming Index",
      font: { family: "Roboto, Open Sans, sans-serif" },
      xaxis: {
        title: "",
        range: [minYear - 0.5, maxYear + 0.5],
      },
      yaxis: { title: "Temperature Anomaly (°C) relative to 1850-1900" },
      showlegend: true,
      legend: {
        orientation: "h",
        x: 0.5,
        xanchor: "center",
        y: -0.2,
      },
      autosize: true,
      margin: { t: 50, l: 50, r: 20, b: 100 },
    };

    // This config makes the chart responsive
    const config = { responsive: true };

    Plotly.newPlot("climate-chart", traces, layout, config);
  }

  // Start everything when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
