#!/bin/bash
set -e -o pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/../src" || exit 1

if ! command -v jq &> /dev/null; then
	echo "jq could not be found, please install it to sort JSON files."
	exit 1
fi

# iterate over all json files in the current directory
for file in *.json; do
	if [[ -f "$file" ]]; then
		if [[ ! -s "$file" ]]; then
			echo "Skipping empty file $file"
			continue
		fi

		if [ "$file" == "lang-list.json" ]; then
			continue
		fi

		# get content of file before sorting
		original_content=$(<"$file")
		# compare with sorted content
		sorted_content=$(jq --tab --sort-keys . "$file")
		if [ "$original_content" == "$sorted_content" ]; then
			echo "$file is already sorted"
			continue
		fi

		echo "Sorting $file"
		tmp=$(mktemp) && jq --tab --sort-keys . "$file" > "$tmp" && mv "$tmp" "$file"
	fi
done
