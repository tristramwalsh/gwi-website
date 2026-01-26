#!/bin/sh

# Generate the current status JSON from source CSVs
echo "Processing data..."
python3 scripts/process_data.py

# Generate last updated timestamp
git log -1 --date=format:"%a %b %d %Y" --format=%cd > public/assets/data/last_updated.txt