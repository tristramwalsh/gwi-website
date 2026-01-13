(function() {
    // Configuration
    const updateInterval = 50; // Update every 50ms (20fps) is sufficient for text
    const billion = 1000000000;

    let climateData = null;
    let basisTimestamp = 0; // Seconds since epoch
    let ratePerSec = 0;
    let baseLevel = 0;

    const OLD_BASIS_DATE = new Date("12/15/2020 00:00 AM");

    function calculateNonCO2_RF(t_old) {
        return (0.85 + (t_old * 0.0017 * 12 / (86400 * 365)));
    }

    function calculateCarbonEmissions(t_old) {
        return ((t_old * 365 * 44 / 12 + 2394.0 * billion));
    }

    function init() {
        // Initialize Counter
        fetch('assets/data/current_climate_state.json')
            .then(response => response.json())
            .then(data => {
                climateData = data;
                
                // Parse basis date (UTC)
                const basisDate = new Date(data.basis_datetime_utc);
                basisTimestamp = basisDate.getTime() / 1000; // to seconds

                // Use the 50th percentile as the main display
                const warmingInfo = data.anthropogenic_warming['50'];
                baseLevel = warmingInfo.level;
                ratePerSec = warmingInfo.rate_per_sec;

                // Start the loop
                setInterval(updateCounter, updateInterval);
                updateCounter(); // Run once immediately
            })
            .catch(err => console.error("Error loading climate state:", err));
    }

    function updateCounter() {
        if (!climateData) return;

        const now = new Date();
        const currentTimestamp = now.getTime() / 1000;
        
        // --- Temperature Warming (New Data) ---
        const t_new = currentTimestamp - basisTimestamp;
        const currentWarming = baseLevel + (ratePerSec * t_new);
        
        let outputHTML = (currentWarming >= 0) ? "+" : "-";
        outputHTML += currentWarming.toFixed(9); // Matches old precision
        
        const tempEl = document.querySelector("#current-temp-rise span");
        if (tempEl) tempEl.innerHTML = outputHTML;

        const dateEl = document.querySelector("#date-count");
        if (dateEl) dateEl.innerHTML = now.toGMTString();

        // --- Unknown Metric 2: NonCO2 RF (Legacy Data) ---
        // We calculate t based on the OLD basis date to preserve continuity 
        // until we get new data/formulas for these metrics.
        const t_old = (now - OLD_BASIS_DATE) / 1000; 

        // Non-CO2 Radiative Forcing
        const currentNonCO2 = calculateNonCO2_RF(t_old);
        let rfHTML = (currentNonCO2 >= 0) ? "+" : "-";
        rfHTML += currentNonCO2.toFixed(9);
        
        const rfEl = document.querySelector("#current-nonCO2_RF span");
        if (rfEl) rfEl.innerHTML = rfHTML;

        // --- Carbon Emissions (Legacy Data) ---
        const emissions = calculateCarbonEmissions(t_old) / billion;
        const emissionsEl = document.querySelector("#current-carbon-emissions span");
        if (emissionsEl) emissionsEl.innerHTML = (emissions / 1000).toFixed(9);

        // GtC (Gigatonnes Carbon)
        
        const emissions_val = calculateCarbonEmissions(t_old); // Total quantity
        const emissions_gtc = emissions_val / billion; // in billions
        
        // Format logic from old app.min.js:
        // (current.emissions_gtc*config.billion*12/44).round(0)...
        const gtc_value = (emissions_gtc * billion * 12 / 44);
        
        const gtcEl = document.querySelector("#current-carbon-emissions_gtc span");
        if (gtcEl) {
            // Formatting with commas
            gtcEl.innerHTML = Math.round(gtc_value).toLocaleString('en-US');
        }
    }

    // Start everything when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
