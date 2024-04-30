// define the basis date
// MM/DD/YYYY
var basisDate = new Date("12/15/2020 00:00 AM");

// functions to return calculated values
// where t = number of seconds since basis date
function calculateTempRise(t) {
    return (1.2163 + (0.00000000075481*t));
}

function calculateNonCO2_RF(t) {
    return (0.85 + (t*0.0017*12/(86400*365)));
}

function calculateCarbonEmissions(t) {
    return ((t*365*44/12 + 2394.0*config.billion));
}

// configuration
//
var config = {
    billion: 1000000000,
    refresh: 10,
    rounding: 7,
    dimension: {
        width: 650,
        height: 500
    },
    offset: {
        x: 129,
        y: 50
    },
    legend: {
        x: 'Cumulative CO2 emissions since 1870 (billion tonnes of carbon)',
        y: 'Human induced warming relative to 1861-80 (degC)',
        x_top: 'Cumulative CO2 emissions since 1870 (billion tonnes of CO2)'
    },
    graph: {
        x: {
            min: 0,
            max: 2500,
            inc: 1000
        },
        y: {
            min: 0,
            max: 5,
            inc: 1
        }
    },
    zoom: {
        center: {
            x: 0,
            y: 0,
        },
        scale: {
            x: 1.1,
            y: 1.1
        },
        boundaries: {
            x: {
                min: 0,
                max: 2500,
                range: 0.00005
            },
            y: {
                min: 0,
                max: 5,
                range: 0.0000000005
            }
        }
    },
    plume: {
        0: 0,
        42.66956007: -0.324264073,
        168.38789974: -0.12150932,
        249.27153423: -0.082603065,
        360.01796923: 0.187335767,
        404.24142595: 0.258650976,
        565.33853099: 0.742709986,
        654.21994634: 0.850157978,
        791.45626873: 1.071725815,
        935.98338583: 1.261718687,
        1084.08225587: 1.439240611,
        1373.04811679: 2.105282392,
        2008.77595658: 3.002201573,
        2413.51816439: 3.59436801,
        1787.54084195: 4.952014096,
        1554.04393624: 4.29334239,
        1354.2467038: 3.821696143,
        1245.9305337: 3.609573646,
        1134.28563713: 3.390934435,
        1045.24956857: 3.170491506,
        939.20164571: 2.907709412,
        762.21944556: 2.390911731,
        608.70771278: 1.828962615,
        488.43905804: 1.459256198,
        436.39456701: 1.303844513,
        382.33221967: 1.113366758,
        363.79592648: 1.05801359,
        297.64117016: 0.824983345,
        146.34613355: 0.591720351,
        90.75934731: 0.433166678,
        26.76973608: 0.325970822
    },
    styles: {
        grid:
                {
                    'stroke': '#ddd',
                    'stroke-width': '1px',
                    'opacity': 0.5
                },
        ticks:
                {
                    'stroke': '#111',
                    'stroke-width': '3px',
                    'opacity': 1
                },
        legends: {
            
            'font-size': '17px',
            'fill': '#111',
            'text-anchor': 'middle'
        },
        plume: {
            gradient: 'l(0,1,1,0)#ffa0a0:70-#fff:85-#fff:99'
        },
        labels: {
            x: {
                'font-size': '12px',
                'fill': '#000',
                'font-weight': 400,
                'text-anchor': 'middle'

            },
            y: {
                'font-size': '12px',
                'fill': '#000',
                'font-weight': 400,
                'text-anchor': 'end'

            }
        }
    }
};
