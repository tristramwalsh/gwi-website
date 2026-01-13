#!/bin/sh

# Generate the current status JSON from source CSVs
echo "Processing data..."
python3 scripts/process_data.py

rm gwi.tar
tar cvf gwi.tar public api

