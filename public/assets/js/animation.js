(function() {
    let chart;
    const ctx = document.getElementById('gwi-chart').getContext('2d');
    const annotationDiv = document.getElementById('chart-annotation');
    
    // Buttons
    const btnPrev = document.getElementById('btn-prev');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnNext = document.getElementById('btn-next');
    
    // Timeline
    const timelineSteps = document.querySelectorAll('.timeline-step');
    const timelineProgress = document.getElementById('timeline-progress');
    
    // RMSE Indicator
    const rmseIndicator = document.getElementById('rmse-indicator');
    const rmseValueSpan = document.getElementById('rmse-value');

    const state = {
        erf: null,
        priors: null,
        gwi: null,
        hadcrut: null,
        step: 0,
        timer: null,
        isPlaying: false,
        rmseCounterInterval: null
    };

    const COLORS = {
        GHG: 'rgb(0, 128, 0)',   // Green
        OHF: 'rgb(255, 165, 0)', // Orange
        Ant: 'rgb(255, 0, 0)',   // Red
        Nat: 'rgb(0, 0, 255)',   // Blue
        Tot: 'rgb(128, 0, 128)', // Purple
        Res: 'rgb(128, 128, 128)', // Grey
        HadCRUT: 'black'
    };

    const AXIS_TITLES = [
        'Radiative Forcing (W/m²)',
        'Temperature Response (°C)',
        'Temperature Response (°C)',
        'Temperature Response (°C)',
        'Temperature Response (°C)',
        'Global Warming Index (°C)'
    ];

    const LAYOUT_TITLES = [
        "Step 1: Aggregate Emissions and Forcing Data (W/m²)",
        "Step 2: Calculate Initial Broad Estimates of Warming (°C)",
        "Step 3: Obtain Total and Anthropogenic Forced Warming as Sums (°C)",
        "Step 4: Compare Total Forced Warming Estimate with Observations (°C)",
        "Step 5: Use Observations to Improve Accuracy and Precision (°C)",
        "Step 6: Global Warming Index: Select Human-induced Warming Component (°C)"
    ];
    
    const ANNOTATIONS = [
        "We start with the Greenhouse Gas (GHG), Other Human Forcing (OHF), and Natural (Nat) forcing estimates (W/m²),<br>including uncertainty ranges. Together, these account for all of the forcing acting on the climate system.",
        "We feed these forcings through a climate response model to convert them into initial warming estimates (Prior Warming).<br>These have a wide uncertainty range as this first calculation is designed to capture the full range of possible outcomes under scientific uncertainty.",
        "We calculate Human-induced warming as the sum of warming from Greenhouse Gases and Other Human Forcings,<br>and Total forced warming by combining Naturally forced warming with Human-induced warming.",
        "We compare the Total forced warming estimate (purple) with the Observations of the real world (black).<br>This shows that our Prior estimate is broadly consistent with the real world, but is not optimally precise or accurate, as we haven't yet included information from these observations into the assessment.",
        "We use the Observations as additional information to constrain our modelled warming, tightening the uncertainty ranges, and improving the accuracy. This process adjusts the warming estimates for all components in order to find the mathematically optimal fit between modelled and real-world warming.<br>Note: Observed warming is the sum of a 'signal' (Total forced warming) and 'noise' (called internal variability - this is the reason for the Residual component).",
        "Finally, the Global Warming Index is defined as just the human-induced warming component. Note that the other warming components calculated in the GWI method are also scientifically important and are used in global climate assessmnets, but the GWI itself specifically refers to the human-induced warming component. The uncertainty range incorporates uncertainties from (i) radiative forcings, (ii) climate response, (iii) observed warming, (iv) alternative possible realisations of internal variability; the shaded ranges are the 5-95th percentiles across a large ensemble of hundreds of millions of samplings across these sources of uncertainty."
    ];

    function init() {
        Promise.all([
            fetch('assets/data/erf/erf_timeseries.csv').then(r => r.text()),
            fetch('assets/data/priors/priors_timeseries.csv').then(r => r.text()),
            fetch('assets/data/gwi/gwi_timeseries.csv').then(r => r.text()),
            fetch('assets/data/temp/HadCRUT.5.0.2.0.analysis.ensemble_series.global.annual.csv').then(r => r.text())
        ]).then(([erf, priors, gwi, hadcrut]) => {
            state.erf = parseErfPriors(erf);
            state.priors = parseErfPriors(priors);
            state.gwi = parseGwi(gwi);
            state.hadcrut = parseHadcrut(hadcrut);

            // Calculate Prior Residual: Observations - Prior Tot
            state.priors.Res = { p5: [], p50: [], p95: [] };
            const len = Math.min(state.priors.Tot.p50.length, state.hadcrut.p50.length);
            for (let i = 0; i < len; i++) {
                const diff = state.hadcrut.p50[i] - state.priors.Tot.p50[i];
                state.priors.Res.p50.push(diff);
                state.priors.Res.p5.push(diff); // Line only for priors
                state.priors.Res.p95.push(diff);
            }
            
            createChart();
            runStep(0);
            
            startAnimation(); // Auto-start

            // Event Listeners
            btnPlayPause.addEventListener('click', togglePlayPause);
            btnNext.addEventListener('click', nextStep);
            btnPrev.addEventListener('click', prevStep);

        }).catch(e => console.error("Animation load error:", e));
    }

    function startAnimation() {
        if (state.timer) return;
        state.isPlaying = true;
        btnPlayPause.textContent = "Pause";
        state.timer = setInterval(() => {
            state.step = (state.step + 1) % 6;
            runStep(state.step);
        }, 6000); 
    }

    function stopAnimation() {
        if (state.timer) {
            clearInterval(state.timer);
            state.timer = null;
        }
        state.isPlaying = false;
        btnPlayPause.textContent = "Play";
    }

    function togglePlayPause() {
        if (state.isPlaying) {
            stopAnimation();
        } else {
            startAnimation();
        }
    }

    function nextStep() {
        stopAnimation(); // Stop auto-play on interaction
        state.step = (state.step + 1) % 6;
        runStep(state.step);
    }

    function prevStep() {
        stopAnimation(); // Stop auto-play on interaction
        state.step = state.step - 1;
        if (state.step < 0) state.step = 5;
        runStep(state.step);
    }


    /* -- Parsers -- */
    function parseErfPriors(csv) {
        const lines = csv.split('\n').filter(l => l.trim().length > 0);
        const dataLines = lines.slice(3);
        
        const res = {
            years: [],
            Ant: { p5:[], p50:[], p95:[] },
            GHG: { p5:[], p50:[], p95:[] },
            Nat: { p5:[], p50:[], p95:[] },
            OHF: { p5:[], p50:[], p95:[] },
            Tot: { p5:[], p50:[], p95:[] }
        };

        dataLines.forEach(line => {
            const cols = line.split(',').map(parseFloat);
            if (isNaN(cols[0])) return;
            if (cols[0] < 1850) return;
            
            res.years.push(cols[0]);

            // Ant (1-5) -> 5, 17, 83, 95, 50
            res.Ant.p5.push(cols[1]);
            res.Ant.p95.push(cols[4]);
            res.Ant.p50.push(cols[5]);

            // GHG (6-10)
            res.GHG.p5.push(cols[6]);
            res.GHG.p95.push(cols[9]);
            res.GHG.p50.push(cols[10]);
            
            // Nat (11-15)
            res.Nat.p5.push(cols[11]);
            res.Nat.p95.push(cols[14]);
            res.Nat.p50.push(cols[15]);

            // OHF (16-20)
            res.OHF.p5.push(cols[16]);
            res.OHF.p95.push(cols[19]);
            res.OHF.p50.push(cols[20]);

            // Tot (21-25)
            res.Tot.p5.push(cols[21]);
            res.Tot.p95.push(cols[24]);
            res.Tot.p50.push(cols[25]);
        });
        return res;
    }

    function parseGwi(csv) {
        const lines = csv.split('\n').filter(l => l.trim().length > 0);
        const dataLines = lines.slice(3);

        const res = {
            years: [],
            Ant: { p5:[], p50:[], p95:[] },
            GHG: { p5:[], p50:[], p95:[] },
            Nat: { p5:[], p50:[], p95:[] },
            OHF: { p5:[], p50:[], p95:[] },
            Tot: { p5:[], p50:[], p95:[] },
            Res: { p5:[], p50:[], p95:[] }
        };

        dataLines.forEach(line => {
            const cols = line.split(',').map(parseFloat);
            if (isNaN(cols[0])) return;
            if (cols[0] < 1850) return;

            res.years.push(cols[0]);

            // GHG (1-5)
            res.GHG.p5.push(cols[1]);
            res.GHG.p95.push(cols[4]);
            res.GHG.p50.push(cols[5]);

            // Nat (6-10)
            res.Nat.p5.push(cols[6]);
            res.Nat.p95.push(cols[9]);
            res.Nat.p50.push(cols[10]);

            // OHF (11-15)
            res.OHF.p5.push(cols[11]);
            res.OHF.p95.push(cols[14]);
            res.OHF.p50.push(cols[15]);

            // Ant (16-20)
            res.Ant.p5.push(cols[16]);
            res.Ant.p95.push(cols[19]);
            res.Ant.p50.push(cols[20]);

            // Tot (21-25)
            res.Tot.p5.push(cols[21]);
            res.Tot.p95.push(cols[24]);
            res.Tot.p50.push(cols[25]);

            // Res (26-30)
            res.Res.p5.push(cols[26]);
            res.Res.p95.push(cols[29]);
            res.Res.p50.push(cols[30]);
        });
        return res;
    }

    function parseHadcrut(csv) {
        const lines = csv.split('\n').filter(l => l.trim().length > 0);
        const dataLines = lines.slice(1);
        
        const parsedRows = [];
        const baselineSums = new Array(200).fill(0);
        let baselineCount = 0;

        dataLines.forEach(line => {
            const cols = line.split(',').map(parseFloat);
            if (cols.length < 203) return;
            
            const year = cols[0];
            if (year < 1850) return;
            
            const vals = cols.slice(3, 203);
            parsedRows.push({ year, vals });

            if (year >= 1850 && year <= 1900) {
                for(let i=0; i<200; i++) {
                    baselineSums[i] += vals[i];
                }
                baselineCount++;
            }
        });

        const baselines = baselineSums.map(s => s / baselineCount);
        
        const res = { years: [], p5: [], p50: [], p95: [] };

        parsedRows.forEach(row => {
            res.years.push(row.year);
            const anomalies = row.vals.map((v, i) => v - baselines[i]);
            anomalies.sort((a,b) => a - b);
            
            // p5 (index 9), p95 (index 189), p50 (avg 99-100)
            res.p5.push(anomalies[9]);
            res.p95.push(anomalies[189]);
            res.p50.push((anomalies[99] + anomalies[100]) / 2);
        });
            
        return res;
    }

    // --- Chart.js Logic ---
    
    const COMPONENTS = ['GHG', 'OHF', 'Nat', 'Ant', 'Tot', 'Res'];

    function createChart() {
        const datasets = [];
        
        COMPONENTS.forEach(comp => {
            const c = COLORS[comp];
            // Remove plume for Tot by making it transparent
            const cAlpha = (comp === 'Tot') ? 'transparent' : c.replace('rgb', 'rgba').replace(')', ', 0.2)');
            
            // Labels
            let label = comp;
            if (comp === 'GHG') label = 'Greenhouse Gases';
            else if (comp === 'OHF') label = 'Other Human Forcing';
            else if (comp === 'Nat') label = 'Natural';
            else if (comp === 'Ant') label = 'Human-induced';
            else if (comp === 'Tot') label = 'Total';
            else if (comp === 'Res') label = 'Residual';

            // 95% (Upper)
            datasets.push({
                label: `${label} 95%`,
                data: [], // Initial empty
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                pointRadius: 0,
                fill: false,
                borderWidth: 0,
                order: 2
            });

            // 5% (Lower) - Fills to Upper (index - 1)
            datasets.push({
                label: `${label} 5%`,
                data: [],
                borderColor: 'transparent',
                backgroundColor: cAlpha, // Plume color
                pointRadius: 0,
                fill: '-1', // Fill to previous dataset (Upper)
                borderWidth: 0,
                order: 2
            });

            // 50% (Median)
            datasets.push({
                label: label,
                data: [],
                borderColor: c,
                backgroundColor: c,
                pointRadius: 0,
                fill: false,
                borderWidth: 2,
                order: 1 // Higher z-index theoretically
            });
        });

        // HadCRUT Dots (Median)
        datasets.push({
            label: 'Observations',
            data: [],
            type: 'line', 
            showLine: false,
            borderColor: 'black',
            backgroundColor: 'black',
            pointRadius: 2,
            borderWidth: 0,
            order: 0 // Top most
        });

        // HadCRUT Range (Error Bars)
        datasets.push({
            label: 'Observations Range',
            data: [],
            type: 'bar',
            backgroundColor: 'black',
            barThickness: 1, 
            grouped: false,
            order: 0
        });

        const years = state.erf.years; // Common labels
        const maxYear = years.length > 0 ? years[years.length - 1] : 2024;

        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: years,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuad'
                },
                scales: {
                    x: {
                        type: 'linear',
                        bounds: 'data',
                        min: 1850,
                        max: maxYear + 1,
                        offset: false,
                        afterBuildTicks: function(axis) {
                            // Ensure maxYear is included
                            const hasMax = axis.ticks.find(t => t.value === maxYear);
                            if (!hasMax) {
                                axis.ticks.push({value: maxYear});
                                axis.ticks.sort((a, b) => a.value - b.value);
                            }
                            // Remove ticks greater than maxYear (e.g. the +1 padding tick)
                            axis.ticks = axis.ticks.filter(t => t.value <= maxYear);
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                return value.toString().replace(',','');
                            }
                        },
                        title: { display: true, text: 'Year' }
                    },
                    y: {
                        min: -2,
                        max: 3,
                        title: { display: true, text: 'Value' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            filter: function(item, data) {
                                // Filter 1: No confidence intervals
                                if (item.text.includes('%')) return false;
                                // Filter 2: No "Observations Range" (fix duplication)
                                if (item.text === 'Observations Range') return false;
                                
                                // Filter 3: Hide if dataset is explicitly hidden (for steps 1 & 2)
                                // We access the dataset config via data.datasets
                                const ds = data.datasets[item.datasetIndex];
                                if (ds.hidden) return false;

                                return true;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Global Warming Index',
                        font: { size: 16 }
                    },
                    tooltip: {
                         enabled: false // Disable tooltips for smoother animation focus
                    }
                }
            },
            plugins: [{
                id: 'zeroLine',
                beforeDraw: (chart) => {
                    const {ctx, chartArea: {left, right}, scales: {y}} = chart;
                    const yPos = y.getPixelForValue(0);
                    if (yPos >= chart.chartArea.top && yPos <= chart.chartArea.bottom) {
                        ctx.save();
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(left, yPos);
                        ctx.lineTo(right, yPos);
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }]
        });
    }

    function runStep(stepNumber) {
        let dataset;
        let showHadcrut = false;
        
        // Visibility Map: [GHG, OHF, Nat, Ant, Tot, Res]
        // Step 0 (ERF): GHG, OHF, Nat are VISIBLE
        // Step 1 (Prior Warming): GHG, OHF, Nat are VISIBLE
        // Step 2 (Sums): GHG, OHF, Nat, Ant, Tot are VISIBLE
        // Step 3 (Comparison/Step 4): ALL VISIBLE. Tot is highlighted (red + plume). Others FAINT (except Res).
        // Step 4 (Constrain/Step 5): ALL VISIBLE. Tot/Ant/Res vibrant. GHG/OHF/Nat FAINT.
        // Step 5 (GWI): Ant VISIBLE. Others HIDDEN.
        
        let hiddenMap = { GHG: true, OHF: true, Nat: true, Ant: true, Tot: true, Res: true };
        let faintMap = { GHG: false, OHF: false, Nat: false, Ant: false, Tot: false, Res: false };
        let showTotPlume = false;
        let showResPlume = false;

        if (stepNumber === 0) {
            dataset = state.erf;
            hiddenMap.GHG = false;
            hiddenMap.OHF = false;
            hiddenMap.Nat = false;
        } else if (stepNumber === 1) {
            dataset = state.priors;
            hiddenMap.GHG = false;
            hiddenMap.OHF = false;
            hiddenMap.Nat = false;
        } else if (stepNumber === 2) {
            dataset = state.priors;
            hiddenMap.GHG = false;
            hiddenMap.OHF = false;
            hiddenMap.Nat = false;
            hiddenMap.Ant = false;
            hiddenMap.Tot = false;
        } else if (stepNumber === 3) {
            dataset = state.priors;
            hiddenMap.GHG = false;
            hiddenMap.OHF = false;
            hiddenMap.Nat = false;
            hiddenMap.Ant = false;
            hiddenMap.Tot = false;
            hiddenMap.Res = false;
            
            faintMap.GHG = true;
            faintMap.OHF = true;
            faintMap.Nat = true;
            faintMap.Ant = true;
            // Residual is NOT faint in step 4
            
            showTotPlume = true;
            showHadcrut = true;
        } else if (stepNumber === 4) {
            dataset = state.gwi;
            hiddenMap.GHG = false;
            hiddenMap.OHF = false;
            hiddenMap.Nat = false;
            hiddenMap.Ant = false;
            hiddenMap.Tot = false;
            hiddenMap.Res = false;

            faintMap.GHG = true;
            faintMap.OHF = true;
            faintMap.Nat = true;
            faintMap.Ant = true;
            // Tot and Res are vibrant

            showTotPlume = true;
            showResPlume = true; // "residual... shading for the 5-95 percentile"
            showHadcrut = true;
        } else if (stepNumber === 5) {
            dataset = state.gwi;
            hiddenMap.GHG = false;
            hiddenMap.OHF = false;
            hiddenMap.Nat = false;
            hiddenMap.Ant = false;
            hiddenMap.Tot = false;
            hiddenMap.Res = false;

            faintMap.GHG = true;
            faintMap.OHF = true;
            faintMap.Nat = true;
            faintMap.Tot = true;
            faintMap.Res = true;

            showHadcrut = true;
        }

        if (!dataset || !chart) return;

        let dsIndex = 0;
        COMPONENTS.forEach(comp => {
            const d = dataset[comp];
            const isHidden = hiddenMap[comp];
            const isFaint = faintMap[comp];
            
            const baseColor = COLORS[comp];
            
            // Plume visibility
            let plumeVisible = true;
            if (comp === 'Tot') plumeVisible = showTotPlume;
            if (comp === 'Res') plumeVisible = showResPlume;

            let lineColor = baseColor;
            let plumeColor = !plumeVisible ? 'transparent' : baseColor.replace('rgb', 'rgba').replace(')', ', 0.2)');
            
            if (isFaint) {
                 lineColor = baseColor.replace('rgb', 'rgba').replace(')', ', 0.1)');
                 if (plumeColor !== 'transparent') {
                     plumeColor = baseColor.replace('rgb', 'rgba').replace(')', ', 0.05)');
                 }
            }

            // 95% (Upper)
            chart.data.datasets[dsIndex].data = d ? d.p95 : [];
            chart.data.datasets[dsIndex].hidden = isHidden;
            dsIndex++;
            
            // 5% (Plume)
            chart.data.datasets[dsIndex].data = d ? d.p5 : [];
            chart.data.datasets[dsIndex].hidden = isHidden;
            chart.data.datasets[dsIndex].backgroundColor = plumeColor;
            dsIndex++;
            
            // 50% (Median)
            chart.data.datasets[dsIndex].data = d ? d.p50 : [];
            chart.data.datasets[dsIndex].hidden = isHidden;
            chart.data.datasets[dsIndex].borderColor = lineColor;
            chart.data.datasets[dsIndex].backgroundColor = lineColor;
            dsIndex++;
        });

        // Update HadCRUT (Last two datasets)
        const indexRange = chart.data.datasets.length - 1;
        const indexDots = chart.data.datasets.length - 2;

        if (showHadcrut) {
            // Median dots
            chart.data.datasets[indexDots].data = state.hadcrut.p50;
            chart.data.datasets[indexDots].hidden = false;
            
            // Error bars (floating bars [min, max])
            const rangeData = state.hadcrut.p5.map((v, i) => [v, state.hadcrut.p95[i]]);
            chart.data.datasets[indexRange].data = rangeData;
            chart.data.datasets[indexRange].hidden = false;
        } else {
             chart.data.datasets[indexDots].hidden = true;
             chart.data.datasets[indexRange].hidden = true;
        }

        // Update Titles
        chart.options.plugins.title.text = LAYOUT_TITLES[stepNumber];
        chart.options.scales.y.title.text = AXIS_TITLES[stepNumber];
        
        // Update Annotation HTML
        annotationDiv.innerHTML = ANNOTATIONS[stepNumber];
        
        // Update Timeline
        updateTimeline(stepNumber);

        // Update RMSE Indicator
        updateRMSE(stepNumber);

        chart.update();
    }
    
    function calculateRMSE(predP50, obsP50) {
        // Observations might be shorter than predictions or have different alignment
        // We calculate RMSD for the overlapping years
        let sumSq = 0;
        let count = 0;
        const len = Math.min(predP50.length, obsP50.length);
        for (let i = 0; i < len; i++) {
            const diff = predP50[i] - obsP50[i];
            sumSq += diff * diff;
            count++;
        }
        return count > 0 ? Math.sqrt(sumSq / count) : 0;
    }

    function animateValue(start, end, duration) {
        if (state.rmseCounterInterval) clearInterval(state.rmseCounterInterval);
        
        const startTime = performance.now();
        
        state.rmseCounterInterval = setInterval(() => {
            const now = performance.now();
            const progress = Math.min((now - startTime) / duration, 1);
            const value = start + (end - start) * progress;
            rmseValueSpan.textContent = value.toFixed(4);
            
            if (progress === 1) {
                clearInterval(state.rmseCounterInterval);
            }
        }, 16); // 60fps
    }

    function updateRMSE(step) {
        if (step === 3 || step === 4) {
            rmseIndicator.style.opacity = "1";
            
            const rmsePrior = calculateRMSE(state.priors.Tot.p50, state.hadcrut.p50);
            const rmseGwi = calculateRMSE(state.gwi.Tot.p50, state.hadcrut.p50);

            if (step === 3) {
                // Initial Prior value
                rmseValueSpan.textContent = rmsePrior.toFixed(4);
            } else if (step === 4) {
                // Animate from Prior to GWI value
                animateValue(rmsePrior, rmseGwi, 1000); // 1s animation matching chart transition
            }
        } else {
            rmseIndicator.style.opacity = "0";
            if (state.rmseCounterInterval) clearInterval(state.rmseCounterInterval);
        }
    }
    
    function updateTimeline(step) {
        // Update Steps
        timelineSteps.forEach((el, idx) => {
            if (idx <= step) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // Update Line Progress
        // Total 6 steps (indices 0 to 5).
        // Percentage = (step / 5) * 100
        const progress = (step / 5) * 100;
        timelineProgress.style.width = `${progress}%`;
    }
    
    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
