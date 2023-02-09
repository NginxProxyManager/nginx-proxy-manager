#!/bin/sh

if (if [ "$PHP81" = true ]; then cgi-fcgi -bind -connect /dev/php81.sock > /dev/null 2>&1; fi && if [ "$PHP82" = true ]; then cgi-fcgi -bind -connect /dev/php82.sock > /dev/null 2>&1; fi && [ "$(curl -sk https://127.0.0.1:81/api/ | jq --raw-output .status)" = "OK" ]); then
	echo "OK"
	exit 0
else
	echo "NOT OK"
	exit 1
fi
