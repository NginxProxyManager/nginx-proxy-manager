#!/bin/sh

# based on https://github.com/jlesage/docker-nginx-proxy-manager/blob/796734a/rootfs/opt/nginx-proxy-manager/bin/lecleaner

BASE="/data/tls/certbot"
live_dir="$BASE/live"
archive_dir="$BASE/archive"
csr_dir="$BASE/csr"
key_dir="$BASE/keys"

# Set of certificate paths actively used.
in_use=""

keep_count=0
delete_count=0
error_count=0

remove_file() {
    f="$1"
    if rm -f "$f"; then
        return 0
    else
        echo "ERROR: Could not remove $f." >&2
        return 1
    fi
}

# Build the set of certificates in use.
for domain_dir in "$live_dir"/*; do
    [ -e "$domain_dir" ] || continue
    if [ ! -d "$domain_dir" ]; then
        continue
    fi
    for certlink in "$domain_dir"/*; do
        [ -e "$certlink" ] || continue
        if [ ! -L "$certlink" ]; then
            continue
        fi
        target=$(readlink -f "$certlink")
        in_use="$in_use $target"
    done
done

echo "----------------------------------------------------------"
echo "Let's Encrypt certificates cleanup - $(date +"%Y/%m/%d %H:%M:%S")"
echo "----------------------------------------------------------"

# Remove all unused certificates from the archive directory.
for domain_dir in "$archive_dir"/*; do
    [ -e "$domain_dir" ] || continue
    if [ ! -d "$domain_dir" ]; then
        continue
    fi
    for certfile in "$domain_dir"/*; do
        [ -e "$certlink" ] || continue
        if echo "$in_use" | grep -q "$certfile"; then
            echo "Keeping $certfile."
            keep_count=$((keep_count+1))
        else
            echo "Deleting $certfile."
            if remove_file "$certfile"; then
                delete_count=$((delete_count+1))
            else
                error_count=$((error_count+1))
            fi
        fi
    done
done

# Remove all files from the csr and key directories.
for dir in "$csr_dir" "$key_dir"; do
    for file in "$dir"/*; do
        [ -e "$file" ] || continue
        if [ ! -f "$file" ]; then
            continue
        fi
        echo "Deleting $file."
        if remove_file "$file"; then
            delete_count=$((delete_count+1))
        else
            error_count=$((error_count+1))
        fi
    done
done

echo "$keep_count file(s) kept."
echo "$delete_count file(s) deleted."
if [ "$error_count" -gt 0 ]; then
    echo "$error_count file(s) failed to be deleted."
fi
