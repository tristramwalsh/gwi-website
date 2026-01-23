(function () {
  // Configuration
  const updateInterval = 50; // Update every 50ms (20fps)

  let gwiData = null;
  let erfData = null;
  let co2Data = null;

  // Helper: Calculate current value based on linear model
  function calculateCurrentValue(basisDateIso, level, ratePerSec) {
    if (!basisDateIso) return 0;
    const basisTimestamp = new Date(basisDateIso).getTime() / 1000;
    const now = new Date().getTime() / 1000;
    const dt = now - basisTimestamp;
    return level + ratePerSec * dt;
  }

  function init() {
    // Fetch all data sources in parallel
    Promise.all([
      fetch("assets/data/current_climate_state.json").then((r) => r.json()),
      fetch("assets/data/current_erf_state.json").then((r) => r.json()),
      fetch("assets/data/current_emissions_state.json").then((r) => r.json()),
    ])
      .then(([gwi, erf, co2]) => {
        gwiData = gwi;
        erfData = erf;
        co2Data = co2;

        // Start loop
        setInterval(updateCounter, updateInterval);
        updateCounter();
      })
      .catch((err) => window.GWIUtils.handleError("Climate data loading", err));
  }

  function updateCounter() {
    const now = new Date();

    // 1. Temperature Warming (GWI)
    if (gwiData) {
      const warmingInfo = gwiData.anthropogenic_warming["50"];
      const val = calculateCurrentValue(
        gwiData.basis_datetime_utc,
        warmingInfo.level,
        warmingInfo.rate_per_sec,
      );

      let outputHTML = val >= 0 ? "+" : "-";
      outputHTML += Math.abs(val).toFixed(9);

      const tempEl = document.querySelector("#current-temp-rise span");
      if (tempEl) tempEl.innerHTML = outputHTML;

      const dateEl = document.querySelector("#date-count");
      if (dateEl) dateEl.innerHTML = now.toGMTString();
    }

    // 2. Non-CO2 ERF
    if (erfData) {
      const val = calculateCurrentValue(
        erfData.basis_date,
        erfData.non_co2_erf_level,
        erfData.non_co2_erf_rate_per_sec,
      );

      let outputHTML = val >= 0 ? "+" : "-";
      outputHTML += Math.abs(val).toFixed(9);

      const erfEl = document.querySelector("#current-nonCO2_RF span");
      if (erfEl) erfEl.innerHTML = outputHTML;
    }

    // 3. CO2 Emissions
    if (co2Data) {
      // Raw value in Tonnes CO2
      const tonnesCO2 = calculateCurrentValue(
        co2Data.basis_date,
        co2Data.co2_emissions_level_tonnes,
        co2Data.co2_emissions_rate_per_sec_tonnes,
      );

      // A) Trillion Tonnes
      const trillionTonnes = tonnesCO2 / 1.0e12;
      const co2El = document.querySelector("#current-carbon-emissions span");
      if (co2El) co2El.innerHTML = trillionTonnes.toFixed(9);

      // B) Equivalent Tonnes of Carbon (Total, not GtC despite ID)
      // Conversion: C = CO2 * (12 / 44)
      const tonnesCarbon = tonnesCO2 * (12.0 / 44.0);

      const carbonEl = document.querySelector(
        "#current-carbon-emissions_gtc span",
      );
      if (carbonEl) {
        carbonEl.innerHTML = Math.round(tonnesCarbon).toLocaleString("en-US");
      }
    }
  }

  // Start everything when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
