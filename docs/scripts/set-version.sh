#!/bin/bash
set -euf

# this script accepts a version number as an argument
# and replaces {{VERSION}} in src/*.md with the provided version number.

if [ "$#" -ne 1 ]; then
	echo "Usage: $0 <version>"
	exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/.." || exit 1

VERSION="$1"
# find all .md files in src/ and replace {{VERSION}} with the provided version number
find src/ -type f -name "*.md" -exec sed -i "s/{{VERSION}}/$VERSION/g" {} \;
