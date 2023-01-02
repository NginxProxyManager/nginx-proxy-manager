#!/bin/bash

if (cgi-fcgi -bind -connect /dev/php81.sock &> /dev/null && cgi-fcgi -bind -connect /dev/php82.sock &> /dev/null && [ "$(wget -q --no-check-certificate https://127.0.0.1:81/api -O - | jq --raw-output '.status')" == "OK" ]); then
	echo "OK"
	exit 0
else
	echo "NOT OK"
	exit 1
fi
