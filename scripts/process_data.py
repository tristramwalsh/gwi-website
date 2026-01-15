import csv
import json
import os
import sys
from datetime import datetime, timezone

# Constants
SECONDS_PER_YEAR = 365.2425 * 24 * 60 * 60

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------


def parse_csv_headers_2row(filename):
    """Parses a two-row header CSV (GWI/ERF style)."""
    with open(filename, 'r') as f:
        reader = csv.reader(f)
        header1 = next(reader)
        header2 = next(reader)
        mapping = {}
        for i, (var, perc) in enumerate(zip(header1, header2)):
            if i == 0:
                continue
            mapping[(var.strip(), perc.strip())] = i
    return mapping


def get_last_row_2row(filename):
    """Returns the last row of a 2-row header CSV."""
    with open(filename, 'r') as f:
        reader = csv.reader(f)
        last_row = None
        for row in reader:
            if row and row[0] and row[0][0].isdigit():
                last_row = row
    return last_row


def is_leap_year(year: int) -> bool:
    return year % 400 == 0 or (year % 4 == 0 and year % 100 != 0)


def midyear_datetime_utc(year: int) -> datetime:
    if is_leap_year(year):
        return datetime(year, 7, 2, 0, 0, 0, tzinfo=timezone.utc)
    return datetime(year, 7, 2, 12, 0, 0, tzinfo=timezone.utc)


def calculate_linear_regression(x_values, y_values):
    n = len(x_values)
    if n < 2:
        return 0.0, 0.0
    sum_x = sum(x_values)
    sum_y = sum(y_values)
    sum_xy = sum(x * y for x, y in zip(x_values, y_values))
    sum_x2 = sum(x * x for x in x_values)
    denominator = n * sum_x2 - sum_x * sum_x
    if denominator == 0:
        return 0.0, sum_y / n
    m = (n * sum_xy - sum_x * sum_y) / denominator
    c = (sum_y - m * sum_x) / n
    return m, c

# ------------------------------------------------------------------------------
# Processing Functions
# ------------------------------------------------------------------------------


def process_gwi_warming():
    data_dir = "public/assets/data/gwi"
    output_file = "public/assets/data/current_climate_state.json"
    ts_file = os.path.join(data_dir, "gwi_timeseries.csv")
    rates_file = os.path.join(data_dir, "gwi_rates.csv")

    if not os.path.exists(ts_file) or not os.path.exists(rates_file):
        print("Skipping GWI: Files not found.")
        return

    ts_mapping = parse_csv_headers_2row(ts_file)
    ts_row = get_last_row_2row(ts_file)
    rates_mapping = parse_csv_headers_2row(rates_file)
    rates_row = get_last_row_2row(rates_file)

    if not ts_row or not rates_row:
        return

    last_year = int(ts_row[0])
    basis_dt = midyear_datetime_utc(last_year)

    anthro_data = {}
    for p in ['5', '50', '95']:
        idx_ts = ts_mapping[('Ant', p)]
        idx_rates = rates_mapping[('Ant', p)]
        anthro_data[p] = {
            "level": float(ts_row[idx_ts]),
            "rate_per_sec": float(rates_row[idx_rates]) / SECONDS_PER_YEAR
        }

    output = {
        "basis_datetime_utc": basis_dt.isoformat().replace("+00:00", "Z"),
        "anthropogenic_warming": anthro_data
    }
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=4)
    print(f"Generated {output_file}")


def process_erf():
    ts_file = "public/assets/data/erf/erf_timeseries.csv"
    output_file = "public/assets/data/current_erf_state.json"

    if not os.path.exists(ts_file):
        return

    mapping = parse_csv_headers_2row(ts_file)
    tot_idx = mapping[('Tot', '50')]
    co2_idx = mapping[('co2', '50')]

    data_points = []
    with open(ts_file, 'r') as f:
        reader = csv.reader(f)
        for row in reader:
            if not row or not row[0] or not row[0][0].isdigit():
                continue
            y = float(row[0])
            val = float(row[tot_idx]) - float(row[co2_idx])
            data_points.append((y, val))

    data_points.sort()
    recent = data_points[-10:]
    m, c = calculate_linear_regression(
        [p[0] for p in recent], [p[1] for p in recent])

    last_year = int(data_points[-1][0])
    basis_dt = midyear_datetime_utc(last_year)

    output = {
        "non_co2_erf_level": m * last_year + c,
        "non_co2_erf_rate_per_sec": m / SECONDS_PER_YEAR,
        "basis_date": basis_dt.isoformat().replace("+00:00", "Z")
    }
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=4)
    print(f"Generated {output_file}")


def process_emissions():
    ts_file = "public/assets/data/emissions_co2/cumulative-co2-including-land.csv"
    output_file = "public/assets/data/current_emissions_state.json"

    if not os.path.exists(ts_file):
        return

    data_points = []
    with open(ts_file, 'r') as f:
        reader = csv.reader(f)
        header = next(reader)
        entity_idx = header.index("Entity")
        year_idx = header.index("Year")
        val_idx = next(i for i, h in enumerate(header) if "Cumulative CO" in h)

        for row in reader:
            if row and row[entity_idx] == "World":
                data_points.append((float(row[year_idx]), float(row[val_idx])))

    data_points.sort()
    recent = data_points[-10:]
    m, c = calculate_linear_regression(
        [p[0] for p in recent], [p[1] for p in recent])

    last_year = int(data_points[-1][0])
    basis_dt = midyear_datetime_utc(last_year)

    output = {
        "co2_emissions_level_tonnes": m * last_year + c,
        "co2_emissions_rate_per_sec_tonnes": m / SECONDS_PER_YEAR,
        "basis_date": basis_dt.isoformat().replace("+00:00", "Z")
    }
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=4)
    print(f"Generated {output_file}")

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------


if __name__ == "__main__":
    print("Running master data processing script...")
    process_gwi_warming()
    process_erf()
    process_emissions()
    print("Success.")
