#! /usr/bin/python2.7

# Python program for serving the temperature as an API

import flask, datetime, time
from flask import jsonify

app = flask.Flask(__name__)
app.config["DEBUG"] = False

# Convert basis date to Unix time
dt = datetime.datetime(2020,12,15,0,0)
basis_date = int(time.mktime(dt.timetuple()))

# Current time in Unix time
current_time = int(time.time())

# Calculate number of seconds since basis date
time_since_basis = current_time - basis_date

#print "current_time: ",current_time
#print "basis_date: ",basis_date
#print "time_since_basis: ",time_since_basis

# Calculate temperature rise in Celsius
temp_rise_in_C = 1.2163 + (0.00000000075481 * time_since_basis);

# Calculate temperature rise in Fahrenheit
temp_rise_in_F = 0.0 + (temp_rise_in_C * 1.8);

#print "temp_rise_in_C: ",temp_rise_in_C
#print "temp_rise_in_F: ",temp_rise_in_F

temp_rise = [
    {'id': 1,
    'title': 'Temperature rise in Celsius',
    'temperature_rise': str(temp_rise_in_C)},
    {'id': 2,
    'title': 'Temperature rise in Fahrenheit',
    'temperature_rise': str(temp_rise_in_F)}
]

@app.route('/')
def api_all():
    # Current time in Unix time
    current_time = int(time.time())
    
    # Calculate number of seconds since basis date
    time_since_basis = current_time - basis_date
    
    #print "current_time: ",current_time
    #print "basis_date: ",basis_date
    #print "time_since_basis: ",time_since_basis
    
    # Calculate temperature rise in Celsius
    temp_rise_in_C = 1.2163 + (0.00000000075481 * time_since_basis);
    
    # Calculate temperature rise in Fahrenheit
    temp_rise_in_F = 0.0 + (temp_rise_in_C * 1.8);
    
    #print "temp_rise_in_C: ",temp_rise_in_C
    #print "temp_rise_in_F: ",temp_rise_in_F
    
    temp_rise = [
        {'id': 1,
        'title': 'Temperature rise in Celsius',
        'temperature_rise': str(temp_rise_in_C)},
        {'id': 2,
        'title': 'Temperature rise in Fahrenheit',
        'temperature_rise': str(temp_rise_in_F)}
    ]
    
    

    return jsonify(temp_rise)

if __name__ == '__main__':
    app.run()
