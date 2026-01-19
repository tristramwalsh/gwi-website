(function() {
    function init() {
        Promise.all([
            fetch('assets/data/gwi/gwi_timeseries.csv').then(r => r.text()),
            fetch('assets/data/erf/erf_timeseries.csv').then(r => r.text()),
            fetch('assets/data/emissions_co2/cumulative-co2-including-land.csv').then(r => r.text()),
            fetch('assets/data/temp/HadCRUT.5.0.2.0.analysis.ensemble_series.global.annual.csv').then(r => r.text())
        ]).then(([gwiText, erfText, co2Text, hadcrutText]) => {
            const data = processData(gwiText, erfText, co2Text, hadcrutText);
            plotGraph(data);
        }).catch(err => console.error("Error loading forcings graph data:", err));
    }

    function processData(gwiText, erfText, co2Text, hadcrutText) {
        // 1. GWI Parsing (Get Ant-50)
        // Header is 2 rows. Row 1: variable, Row 2: percentile
        const gwiLines = gwiText.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        // Find indices
        const gwiHeader1 = gwiLines[0].split(',');
        const gwiHeader2 = gwiLines[1].split(',');
        let ant50Idx = -1;
        for (let i = 0; i < gwiHeader1.length; i++) {
            if (gwiHeader1[i].trim() === 'Ant' && gwiHeader2[i].trim() === '50') {
                ant50Idx = i;
                break;
            }
        }
        
        const gwiData = { years: [], ant50: [] };
        // Data starts at line index 3 (0-based: 0, 1 headers, 2 Year line?)
        // Let's look at file structure from previous turns. 
        // Line 1: variable...
        // Line 2: percentile...
        // Line 3: Year,,,... (Header for first column, empty for others)
        // Line 4: 1750...
        const gwiDataLines = gwiLines.slice(3);
        const yearMap = new Map(); // Use map to sync data

        gwiDataLines.forEach(line => {
            const parts = line.split(',');
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
        const erfLines = erfText.split('\n').filter(l => l.trim());
        const erfHeader1 = erfLines[0].split(',');
        const erfHeader2 = erfLines[1].split(',');
        
        // We need 'Ant' 50th and 'co2' 50th from erf file as per user instructions:
        // "ant-50 minus co2-50" from the forcings dataset.
        // Wait, does ERF have Ant? Yes, based on file preview.
        let erfAnt50Idx = -1;
        let erfCo250Idx = -1;
        for (let i = 0; i < erfHeader1.length; i++) {
            const v = erfHeader1[i].trim();
            const p = erfHeader2[i].trim();
            if (v === 'Ant' && p === '50') erfAnt50Idx = i;
            if (v === 'co2' && p === '50') erfCo250Idx = i;
        }

        const erfDataLines = erfLines.slice(3);
        erfDataLines.forEach(line => {
            const parts = line.split(',');
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
        const co2Lines = co2Text.split('\n').filter(l => l.trim());
        // Header: Entity, Code, Year, ...
        const co2Header = co2Lines[0].split(',');
        const entityIdx = co2Header.indexOf('Entity');
        const yearIdx = co2Header.indexOf('Year');
        // Find the value column (long name)
        const valIdx = co2Header.findIndex(h => h.includes('Cumulative CO'));

        const co2DataLines = co2Lines.slice(1);
        co2DataLines.forEach(line => {
            // CSV might have quoted strings with commas, but Entity 'World' is safe.
            // Simple split ok for now given known structure.
             const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // regex split for CSV
             if (parts[entityIdx] === 'World') {
                 const year = parseFloat(parts[yearIdx]);
                 const val = parseFloat(parts[valIdx]);
                 if (yearMap.has(year)) {
                     // Convert to Trillion Tonnes (TtCO2)
                     yearMap.get(year).co2 = val / 1e12; 
                 }
             }
        });

        // 4. HadCRUT Parsing (Observed Temp)
        const hadLines = hadcrutText.split('\n').filter(l => l.trim());
        const hadData = { years: [], val: [], error_upper: [], error_lower: [] };
        
        // Calculate baseline 1850-1900
        let baselineSum = 0;
        let baselineCount = 0;
        const hadDataTemp = []; // Store temporarily to apply baseline later

        hadLines.slice(1).forEach(line => {
            const parts = line.split(',');
            const year = parseInt(parts[0]);
            const realizations = parts.slice(3, 203).map(v => parseFloat(v)).sort((a,b)=>a-b);
            
            const p5 = realizations[9];
            const p50 = (realizations[99] + realizations[100]) / 2;
            const p95 = realizations[189];

            if (year >= 1850 && year <= 1900) {
                baselineSum += p50;
                baselineCount++;
            }
            hadDataTemp.push({year, p5, p50, p95});
        });

        const baseline = baselineCount > 0 ? baselineSum / baselineCount : 0;

        hadDataTemp.forEach(d => {
            hadData.years.push(d.year);
            hadData.val.push(d.p50 - baseline);
            hadData.error_upper.push((d.p95 - baseline) - (d.p50 - baseline));
            hadData.error_lower.push((d.p50 - baseline) - (d.p5 - baseline));
        });

        // consolidate final arrays for plotting
        // We only plot years where we have data for the stack (up to last GWI year usually)
        const years = [];
        const ant = [];
        const co2 = [];
        const other = [];
        
        // Iterate sorted years
        const sortedYears = Array.from(yearMap.keys()).sort((a,b)=>a-b);
        
        sortedYears.forEach(y => {
            const d = yearMap.get(y);
            // We need both co2 and otherForcing to exist for the stack logic
            // Assuming data is aligned or we allow gaps. 
            // The GWI ant line should exist for all.
            if (d.ant !== undefined) {
                years.push(y);
                ant.push(d.ant);
                co2.push(d.co2 || 0); // Default to 0 if missing (e.g. early years?)
                other.push(d.otherForcing || 0);
            }
        });

        return { years, ant, co2, other, hadData };
    }

    function plotGraph(data) {
        // Calculate Scaling Factor
        // We want the end of the Red Line (Ant) to align with the Top of the Stack (CO2 + Other)
        // at the rightmost point (latest year).
        // AND we want the y=0 lines to align.
        // This implies a strict proportional scaling: Range2 = Range1 * (Top2 / Top1)
        
        const lastIdx = data.years.length - 1;
        const lastAnt = data.ant[lastIdx];
        const lastStack = data.co2[lastIdx] + data.other[lastIdx];
        
        // 1. Determine Range 1 (Temp) based on data min/max
        const maxTemp = Math.max(...data.ant, ...data.hadData.val.map((v,i) => v + data.hadData.error_upper[i] || 0));
        const minTemp = Math.min(...data.ant, ...data.hadData.val.map((v,i) => v - data.hadData.error_lower[i] || 0));
        
        // Add some padding
        const range1 = [minTemp - 0.2, maxTemp + 0.2];

        // 2. Calculate Scaling Ratio
        // Ratio = StackValue / TempValue
        const ratio = lastStack / lastAnt;

        // 3. Calculate Range 2 based on Ratio to ensure 0->0 and Top->Top alignment
        const range2 = [range1[0] * ratio, range1[1] * ratio];
        
        // Traces
        
        // 1. Cumulative CO2 (Dark Grey, Filled)
        const traceCO2 = {
            x: data.years,
            y: data.co2,
            name: 'Cumulative CO₂ emissions',
            type: 'scatter',
            mode: 'none',
            stackgroup: 'one',
            fillcolor: 'rgba(200, 200, 200, 0.6)', // Light grey

            yaxis: 'y2',
            hoverinfo: 'y+name'
        };

        // 2. Other Human Forcings (Dark Grey, Stacked on CO2)
        const traceOther = {
            x: data.years,
            y: data.other,
            name: 'Other climate drivers',
            type: 'scatter',
            mode: 'none',
            stackgroup: 'one',
            fillcolor: 'rgba(128, 128, 128, 0.6)', // Dark grey
            yaxis: 'y2',
             hoverinfo: 'y+name'
        };

        // 2.5 Total Human Forcing (Grey Line)
        const totalForcing = data.co2.map((v, i) => v + data.other[i]);
        const traceTotal = {
             x: data.years,
             y: totalForcing,
             name: 'Total anthropogenic forcing',
             type: 'scatter',
             mode: 'lines',
             line: { color: 'grey', width: 2 },
             yaxis: 'y2',
             hoverinfo: 'skip'
        };

        // 3. Observed Temp (HadCRUT)
        const traceObs = {
            x: data.hadData.years,
            y: data.hadData.val,
            name: 'Annual observations', // Matching legend in image
            type: 'scatter',
            mode: 'lines',
            line: { color: 'black', width: 1 },
            error_y: {
                type: 'data',
                symmetric: false,
                array: data.hadData.error_upper,
                arrayminus: data.hadData.error_lower,
                color: 'rgba(0,0,0,0.4)',
                thickness: 0.5,
                width: 0
            }
        };

        // 4. Human-induced Warming (Ant50, Red Line)
        const traceAnt = {
            x: data.years,
            y: data.ant,
            name: 'Human-induced warming',
            type: 'scatter',
            mode: 'lines',
            line: { color: 'red', width: 3 }
        };

        const layout = {
            title: 'Global Warming Index & Forcing Contributions',
            font: { family: 'Roboto, Open Sans, sans-serif' },
            xaxis: { 
                range: [1850, 2026]
            },
            yaxis: { 
                title: 'GMST Warming relative to 1850-1900 (°C)',
                range: range1,
                zeroline: true,
                overlaying: 'y2' // Put this axis ON TOP of y2
            },
            yaxis2: {
                title: 'Cumulative CO₂ emissions (TtCO₂) & other drivers (W/m²)',
                // overlaying: 'y', // Removed: This is now the base axis
                side: 'right',
                range: range2,
                showgrid: false,
                zeroline: false
            },
            legend: {
                orientation: 'h', // Horizontal
                x: 0.5,
                y: -0.2, // Move to bottom
                xanchor: 'center',
                yanchor: 'top',
                bgcolor: 'rgba(255,255,255,0.8)'
            },
            margin: { t: 50, l: 60, r: 60, b: 80 } // Increased bottom margin for legend
        };
        
        const config = { responsive: true };

        Plotly.newPlot('forcings-chart', [traceCO2, traceOther, traceTotal, traceObs, traceAnt], layout, config);
    }

    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
