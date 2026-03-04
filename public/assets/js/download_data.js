document.addEventListener("DOMContentLoaded", function () {
  const downloadBtn = document.getElementById("btn-download-gwi");
  if (!downloadBtn) return;

  downloadBtn.addEventListener("click", function () {
    const filesToDownload = [
      { url: "assets/data/gwi/gwi_timeseries.csv", name: "gwi_timeseries.csv" },
      { url: "assets/data/gwi/gwi_headlines.csv", name: "gwi_headlines.csv" },
      { url: "assets/data/gwi/gwi_rates.csv", name: "gwi_rates.csv" },
    ];

    const originalText = downloadBtn.innerText;
    downloadBtn.innerText = "Zipping...";
    downloadBtn.disabled = true;

    Promise.all(
      filesToDownload.map((file) =>
        fetch(file.url).then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load ${file.name}`);
          }
          return response.text().then((text) => ({ name: file.name, text }));
        })
      )
    )
      .then((filesData) => {
        const zip = new JSZip();
        filesData.forEach((file) => {
          zip.file(file.name, file.text);
        });

        zip.generateAsync({ type: "blob" }).then(function (content) {
          const a = document.createElement("a");
          const url = URL.createObjectURL(content);
          a.href = url;
          a.download = "GWI_Data.zip";
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 0);

          downloadBtn.innerText = originalText;
          downloadBtn.disabled = false;
        });
      })
      .catch((err) => {
        console.error("Error downloading data:", err);
        downloadBtn.innerText = "Error (check console)";
        setTimeout(() => {
          downloadBtn.innerText = originalText;
          downloadBtn.disabled = false;
        }, 3000);
      });
  });
});
