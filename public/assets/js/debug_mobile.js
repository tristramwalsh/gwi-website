(function() {
  const logDiv = document.createElement('div');
  logDiv.id = 'mobile-debug-log';
  logDiv.style.position = 'fixed';
  logDiv.style.top = '0';
  logDiv.style.left = '0';
  logDiv.style.width = '100%';
  logDiv.style.height = '250px';
  logDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
  logDiv.style.color = '#fff';
  logDiv.style.overflowY = 'auto';
  logDiv.style.fontSize = '12px';
  logDiv.style.zIndex = '10000';
  logDiv.style.padding = '10px';
  logDiv.style.fontFamily = 'monospace';
  
  const contentDiv = document.createElement('div');
  logDiv.appendChild(contentDiv);

  // Big easy-to-tap button at the bottom
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'TAP TO COPY LOG';
  copyBtn.style.width = '100%';
  copyBtn.style.padding = '15px';
  copyBtn.style.marginTop = '10px';
  copyBtn.style.backgroundColor = '#28a745';
  copyBtn.style.color = 'white';
  copyBtn.style.border = 'none';
  copyBtn.style.fontWeight = 'bold';
  copyBtn.style.borderRadius = '5px';

  copyBtn.onclick = function() {
      const text = contentDiv.innerText;
      
      // Fallback copy method
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
          document.execCommand('copy');
          copyBtn.textContent = 'COPIED!';
          setTimeout(() => { copyBtn.textContent = 'TAP TO COPY LOG'; }, 2000);
      } catch (err) {
          alert('Manual copy needed: ' + text.substring(0, 100) + '...');
      }
      document.body.removeChild(textArea);
  };
  logDiv.appendChild(copyBtn);
  document.body.appendChild(logDiv);

  function log(msg) {
    const p = document.createElement('div');
    p.textContent = `[${new Date().toISOString().split('T')[1].split('.')[0]}] ${msg}`;
    contentDiv.appendChild(p);
    console.log(msg);
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  window.onerror = function(msg, url, line, col, error) {
    log(`GLOBAL ERROR: ${msg} at ${line}:${col}`);
    return false;
  };

  log('Debug script loaded');

  window.addEventListener('load', () => {
    log('Window loaded');
    setTimeout(checkCharts, 1000);
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
      const computedStyle = window.getComputedStyle(canvas);

      log(`Canvas #${id}: ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`);
      log(`  - Style: vis=${computedStyle.visibility}, disp=${computedStyle.display}`);

      const rootStyle = window.getComputedStyle(document.documentElement);
      const testColor = rootStyle.getPropertyValue('--color-plot-natural').trim();
      log(`  - CSS Var (--color-plot-natural): "${testColor}"`);

      // Add a red border to verify visibility
      canvas.style.border = '2px solid red';

      if (typeof Chart !== 'undefined') {
        const chart = Chart.getChart(id);
        if (chart) {
             log(`  - Chart: FOUND (${chart.data.datasets.length} ds)`);
             const firstDS = chart.data.datasets.find(d => !d.hidden && d.data.length > 0);
             if (firstDS) {
                 const sample = firstDS.data[0];
                 log(`  - Data: ${JSON.stringify(sample)}`);
             }
             const yScale = chart.scales['y'];
             if (yScale) {
                 log(`  - Y-Scale: ${yScale.min.toFixed(2)} to ${yScale.max.toFixed(2)}`);
             }
        } else {
             log(`  - Chart: NOT FOUND`);
        }
      } else {
          log(`  - Chart global missing`);
      }
    });
  }

  // Poll
  setTimeout(checkCharts, 2000);
  setTimeout(checkCharts, 5000);
})();