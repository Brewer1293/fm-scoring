#!/bin/bash
# Run (or double-click, if your file manager allows) to start FM player scoring. Finds Python 3.11+, then runs start.py.
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:$PATH"

for name in python3.14 python3.13 python3.12 python3.11 python3; do
  path=$(command -v "$name") || continue
  if "$path" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null; then
    exec "$path" start.py
  fi
done

echo "FM player scoring needs Python 3.11 or newer. Install it with your package manager"
echo "(e.g. sudo apt install python3), or from https://www.python.org/downloads/, then run this again."
read -r -p "Press Enter to close. "
