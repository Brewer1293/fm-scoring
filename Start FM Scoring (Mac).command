#!/bin/bash
# Double-click to start FM player scoring. Finds Python 3.11 or newer, then runs start.py.
cd "$(dirname "$0")" || exit 1

# A double-clicked script doesn't get the PATH your shell would: add where Python and the assistants usually live.
for dir in /Library/Frameworks/Python.framework/Versions/3.*/bin; do
  [ -d "$dir" ] && PATH="$dir:$PATH"
done
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

find_python() {
  for name in python3.14 python3.13 python3.12 python3.11 python3; do
    path=$(command -v "$name") || continue
    # Apple's /usr/bin/python3 offers to install developer tools if they're missing (and is too old anyway)
    if [ "$path" = /usr/bin/python3 ] && ! xcode-select -p >/dev/null 2>&1; then continue; fi
    if "$path" -c 'import sys; sys.exit(sys.version_info < (3, 11))' 2>/dev/null; then
      echo "$path"
      return 0
    fi
  done
  return 1
}

if PY=$(find_python); then
  exec "$PY" start.py
fi

echo "FM player scoring needs Python 3.11 or newer, and it isn't installed yet."
echo
echo "Opening python.org in your browser: download Python, open the installer and click"
echo "through it. Then double-click this file again."
open "https://www.python.org/downloads/"
echo
read -r -p "Press Enter to close. "
