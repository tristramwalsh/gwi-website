FROM ubuntu:22.04
RUN apt-get update
RUN apt-get -y dist-upgrade
RUN apt-get -y install apache2-utils apache2 python3 python3-pip libapache2-mod-wsgi-py3
COPY 000-default.conf /etc/apache2/sites-enabled
COPY public /var/www/html/public
COPY api /var/www/html/api
RUN a2enmod wsgi
EXPOSE 80
CMD /usr/sbin/apache2ctl -DFOREGROUND
