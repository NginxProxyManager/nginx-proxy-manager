#!/command/with-contenv bash
# shellcheck shell=bash

set -e

# in s6, environmental variables are written as text files for s6 to monitor
# search through full-path filenames for files ending in "__FILE"
log_info 'Docker secrets ...'

for FILENAME in $(find /var/run/s6/container_environment/ | grep "__FILE$"); do
	echo "[secret-init] Evaluating ${FILENAME##*/} ..."

	# set SECRETFILE to the contents of the full-path textfile
	SECRETFILE=$(cat "${FILENAME}")
	# if SECRETFILE exists / is not null
	if [[ -f "${SECRETFILE}" ]]; then
		# strip the appended "__FILE" from environmental variable name ...
		STRIPFILE=$(echo "${FILENAME}" | sed "s/__FILE//g")
		# echo "[secret-init] Set STRIPFILE to ${STRIPFILE}"  # DEBUG - rm for prod!

		# ... and set value to contents of secretfile
		# since s6 uses text files, this is effectively "export ..."
		printf $(cat "${SECRETFILE}") > "${STRIPFILE}"
		# echo "[secret-init] Set ${STRIPFILE##*/} to $(cat ${STRIPFILE})"  # DEBUG - rm for prod!"
		echo "Success: ${STRIPFILE##*/} set from ${FILENAME##*/}"

	else
		echo "Cannot find secret in ${FILENAME}"
	fi
done
