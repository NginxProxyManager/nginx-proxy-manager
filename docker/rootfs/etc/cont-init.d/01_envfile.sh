#! /bin/bash
# ref: https://github.com/linuxserver/docker-baseimage-alpine/blob/master/root/etc/cont-init.d/01-envfile

# in s6, environmental variables are written as text files for s6 to monitor
for FILENAME in $(find /var/run/s6/container_environment/ | grep "^.*__FILE"); do
    echo "[secret-init] Evaluating ${FILENAME}"

    # set SECRETFILE to the contents of the variable
    SECRETFILE=$(cat ${FILENAME})
    # SECRETFILE=${FILENAME}
    echo "[secret-init] Setting SECRETFILE to ${SECRETFILE}..."  # DEBUG - rm for prod!

    # if SECRETFILE exists / is not null
    if [[ -f ${SECRETFILE} ]]; then
        # strip the appended "__FILE" from environmental variable name ...
        STRIPFILE=$(echo $FILENAME | sed "s/__FILE//g")   
        echo "[secret-init] Set STRIPFILE to ${STRIPFILE}"  # DEBUG - rm for prod!

        # ... and set value to contents of secretfile
        # since s6 uses text files, this is effectively "export ..."
        cat ${SECRETFILE} > ${STRIPFILE}
        echo "[secret-init] Set ${STRIPFILE} to $(cat ${STRIPFILE})"  # DEBUG - rm for prod!"
        echo "[secret-init] Success! ${STRIPFILE##*/} set from ${FILENAME##*/}"

    else
        echo "[secret-init] cannot find secret in ${FILENAME##*/}"
    fi
done
