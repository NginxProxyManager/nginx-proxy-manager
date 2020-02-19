#!/bin/bash

if [ -t 1 ]; then
	export PS1="\e[1;34m[\e[1;33m\u@\e[1;32mdocker-\h\e[1;37m:\w\[\e[1;34m]\e[1;36m\\$ \e[0m"
fi

# Aliases
alias l='ls -lAsh --color'
alias ls='ls -C1 --color'
alias cp='cp -ip'
alias rm='rm -i'
alias mv='mv -i'
alias h='cd ~;clear;'

. /etc/os-release

echo -e -n '\E[1;34m'
figlet -w 120 "NginxProxyManager"
echo -e "\E[1;36mVersion \E[1;32m${NPM_BUILD_VERSION:-2.0.0-dev}\E[1;36m (${NPM_BUILD_COMMIT:-dev}) ${NPM_BUILD_DATE:-0000-00-00}, Nginx \E[1;32m${NGINX_VERSION:-unknown}\E[1;36m, Alpine \E[1;32m${VERSION_ID:-unknown}\E[1;36m, Kernel \E[1;32m$(uname -r)\E[0m"
echo
