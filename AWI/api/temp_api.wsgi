#! /usr/bin/python2.7

import sys

sys.path.insert(0, '/var/www/html/AWI/api')

from temp_api import app

#Initialize WSGI app object
application = app
