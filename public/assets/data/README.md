# Data Sources

This directory contains the source CSV files used to power the Global Warming Index website.

## Files
- `gwi/gwi_timeseries.csv`: Historical timeseries of warming (attributed components).
- `gwi/gwi_rates.csv`: Rates of warming (rolling 10-year AR6 rate definition).
- `gwi/gwi_headlines.csv`: Headline single-year and decadal warming values (download only).
- `erf/erf_timeseries.csv`: Effective radiative forcing timeseries.
- `priors/priors_timeseries.csv`: Prior (model-only) warming estimates, used in the methodology animation.
- `temp/HadCRUT.*.analysis.ensemble_series.global.annual.csv`: Observational temperature data (HadCRUT5 annual global ensemble).
- `emissions_co2/cumulative-co2-including-land.csv` (plus `.metadata.json` and `readme.md`): Cumulative CO2 emissions including land-use change, as downloaded from Our World in Data.
- `legacy/`: Contains older datasets (e.g., spreadsheets, forcing.txt) for reference.

Auto-generated files (**do not edit manually**; see notes below):
- `current_climate_state.json`, `current_erf_state.json`, `current_emissions_state.json`: Current levels and rates used by the live counters and the API.
- `data_manifest.json`: Records the HadCRUT filename, so the frontend does not need its version number hardcoded.
- `last_updated.txt`: Date of the latest commit, shown in the footer.

## Updating Data
To update the website, overwrite these files with the latest versions from the annual assessment (CSV filenames have been shortened, except for HadCRUT and emissions, which keep their downloaded names).

- **GWI, ERF and priors**: Columns are located by their header names (`variable` and `percentile` rows), not by position, so column order may change. The variables used are `Ant`, `GHG`, `Nat`, `OHF`, `Tot`, `Res` (GWI) and `Ant`, `co2` (ERF), at the 5th, 50th and 95th percentiles. The GWI timeseries' final year sets the end year for the website.
- **HadCRUT**: Keep exactly one HadCRUT CSV in `temp/`. Delete the old file when adding a new version (the build fails if there are zero or several). Any years after the GWI end year (e.g. a partial current year) are dropped automatically when plotting.
- **Emissions**: Emissions data are published with a lag (the Global Carbon Budget is released each November). If the emissions data ends before the GWI data, the forcings graph extrapolates cumulative emissions to the GWI end year using the same rate as the live counter (marked "extrapolated" in the tooltip). Once the newer emissions data is released, replace the file and the extrapolation stops automatically.
- **Citations**: Update the IGCC references in `index.html` and `info_page.html` to point to the latest paper.

After updating, run `python3 scripts/process_data.py` and check the website locally (e.g. `python3 -m http.server -d public`).

## Sources
- GWI
    - Scripts that generate the GWI datasets are available from: [Global Warming Index GitHub Repository](https://github.com/tristramwalsh/global-warming-index)
    - Official GWI dataset CSVs produced by those scripts are available from: [IGCC Assessment (Indicators of Global Climate Change)](https://github.com/ClimateIndicator/anthropogenic-warming-assessment)
- Effective Radiative Forcing
    - Official datasets from: [IGCC Assessment (Indicators of Global Climate Change)](https://github.com/ClimateIndicator/forcing-timeseries)
    - Pre-processed versions of those are produced as outputs from the GWI calculations from: [Global Warming Index GitHub Repository](https://github.com/tristramwalsh/global-warming-index)
- Observed Temperature Data
    - HadCRUT5 CSV dataset from: [Met Office](https://www.metoffice.gov.uk/hadobs/hadcrut5/)
- Emissions
    - CO2 emissions data from: [Global Carbon Budget (via Our World In Data)](https://ourworldindata.org/grapher/cumulative-co2-including-land?tab=line&country=~OWID_WRL&overlay=download-data&v=1&csvType=filtered&useColumnShortNames=false)

### A note on the auto-generated files
The JSON files listed above are **automatically generated** by `scripts/process_data.py` from the CSV files during the build process, and `last_updated.txt` by `build.sh`. Do not edit them manually (this is also why they are included in `.gitignore`). When you are editing the codebase, you will need to regenerate them by either:
1. Running the build process (e.g., `./build.sh`), which will call the script automatically; or
2. Running the script directly: `python3 scripts/process_data.py`
