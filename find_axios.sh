#!/bin/bash

# Script to find all remaining axios usage in client/src
echo "=== Remaining Axios Usage in Client ===" 

cd /home/zohra/Desktop/zohra-rms/zohra-rms-v2/client/src

# Find all axios.get/post/put/delete calls
echo ""
echo "Files with raw axios calls:"
grep -r "axios\.\(get\|post\|put\|delete\|patch\)" --include="*.jsx" --include="*.js" --exclude-dir=node_modules --exclude-dir=pages_backup* . | cut -d: -f1 | sort | uniq

echo ""
echo "Total files affected:"
grep -r "axios\.\(get\|post\|put\|delete\|patch\)" --include="*.jsx" --include="*.js" --exclude-dir=node_modules --exclude-dir=pages_backup* . | cut -d: -f1 | sort | uniq | wc -l
