(function() {
  const logDiv = document.createElement('div');
  logDiv.id = 'mobile-debug-log';
  logDiv.style.position = 'fixed';
  logDiv.style.top = '0';
  logDiv.style.left = '0';
  logDiv.style.width = '100%';
  logDiv.style.height = '200px';
  logDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  logDiv.style.color = '#fff';
  logDiv.style.overflowY = 'scroll';
  logDiv.style.fontSize = '12px';
  logDiv.style.zIndex = '9999';
  logDiv.style.padding = '5px';
  logDiv.style.fontFamily = 'monospace';
  document.body.appendChild(logDiv);

  function log(msg) {
    const p = document.createElement('div');
    p.textContent = `[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`;
    logDiv.appendChild(p);
    console.log(msg);
  }

  log('Debug script loaded');

  window.addEventListener('load', () => {
    log('Window loaded');
    checkCharts();
  });

  function checkCharts() {
    const chartIds = ['climate-chart', 'forcings-chart'];
    chartIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (!canvas) {
        log(`ERROR: Canvas #${id} not found!`);
        return;
      }
      
      const rect = canvas.getBoundingClientRect();
      const parent = canvas.parentElement;
      const parentRect = parent ? parent.getBoundingClientRect() : null;
      const computedStyle = window.getComputedStyle(canvas);

      log(`Canvas #${id}:`);
      log(`  - Dimensions: ${rect.width}x${rect.height}`);
      log(`  - Visibility: ${computedStyle.visibility}, Display: ${computedStyle.display}, Opacity: ${computedStyle.opacity}`);
      if (parent) {
         log(`  - Parent: ${parent.tagName}.${parent.className} (${parentRect.width}x${parentRect.height})`);
      } else {
         log(`  - Parent: null`);
      }

      // Check if Chart instance is attached (Chart.js stores it on the DOM element)
      // Note: Chart.js v3+ stores it differently, but usually accessible via Chart.getChart(id)
      if (typeof Chart !== 'undefined') {
        const chart = Chart.getChart(id);
        if (chart) {
             log(`  - Chart Instance: FOUND`);
             log(`  - Chart Data: ${chart.data.datasets.length} datasets`);
        } else {
             log(`  - Chart Instance: NOT FOUND`);
        }
      } else {
          log(`  - Chart global not found!`);
      }
    });
  }

  // Poll for a few seconds to catch async loading
  setTimeout(checkCharts, 1000);
  setTimeout(checkCharts, 3000);
  setTimeout(checkCharts, 5000);

})();
