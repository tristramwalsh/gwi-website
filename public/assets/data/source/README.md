# Data Sources

This directory contains the source CSV files used to power the Global Warming Index website.

## Files
- `gwi_timeseries.csv`: Historical timeseries of warming.
- `gwi_rates.csv`: Current rates of warming.
- `HadCRUT.*.csv`: Observational temperature data (HadCRUT).

## Updating Data
To update the website, overwrite these files with the latest versions from the annual assessment (CSV filenames have been shortened).

### A nocte on `current_climate_state.json`
The `current_climate_state.json` file used by the frontend is **automatically generated** by `scripts/process_data.py` from these CSV files during the build process. Do not edit `current_climate_state.json` manually (this is noted in that file, and also why it is included in `.gitignore`). When you are editing the codebase, you will need to regenerate this by either:
1. Running the build process (e.g., `./build.sh`), which will call the script automatically; or
2. Running the script directly: `python3 scripts/process_data.py`

## Sources
- Scripts that generate the GWI datasets are available from: [https://github.com/tristramwalsh/global-warming-index](https://github.com/tristramwalsh/global-warming-index)
- Official GWI dataset CSVs produced by those scripts are available from: [https://github.com/ClimateIndicator/anthropogenic-warming-assessment](https://github.com/ClimateIndicator/anthropogenic-warming-assessment)
- HadCRUT5 CSV dataset from: [https://www.metoffice.gov.uk/hadobs/hadcrut5/](https://www.metoffice.gov.uk/hadobs/hadcrut5/)
