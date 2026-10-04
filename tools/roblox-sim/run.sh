#!/bin/bash
# Runs a game's server and client code on a FAKE Roblox runtime (no Studio needed) and plays a scripted scenario:
# joins, hits, drops, shop, saving, migration... Catches runtime errors the type checker cannot
# (wrong property names / types in GUI tables, missing remote handlers, DataStore edge cases).
#   tools/roblox-sim/run.sh anime-card-mine
# It is NOT a replacement for testing in Studio (no physics, no rendering).
set -uo pipefail
GAME="${1:?usage: tools/roblox-sim/run.sh <game>}"
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/../../out/sim"
BIN="$HOME/.local/bin"
mkdir -p "$OUT"
if [ ! -x "$BIN/luau" ]; then
  echo "== downloading the Luau interpreter"
  curl -sSL -o "$OUT/luau.zip" https://github.com/luau-lang/luau/releases/latest/download/luau-ubuntu.zip && unzip -o -q "$OUT/luau.zip" luau -d "$BIN" || { echo "cannot get luau"; exit 1; }
  chmod +x "$BIN/luau"
fi
[ -f "$OUT/classes.txt" ] || python3 "$HERE/gen-data.py" "$OUT" || exit 1
status=0
for mode in server client; do
  echo "== $mode scenario"
  python3 "$HERE/build.py" "$GAME" "$mode" "$OUT" "$OUT/$GAME.$mode.luau" || exit 1
  "$BIN/luau" "$OUT/$GAME.$mode.luau" > "$OUT/$GAME.$mode.log" 2>&1
  grep -E "CHECK FAILED|RUNTIME ERROR|TIMEOUT|^!!" "$OUT/$GAME.$mode.log" | sort -u | head -20
  total=$(grep -E "^TOTAL PROBLEMS" "$OUT/$GAME.$mode.log" | awk '{print $3}')
  echo "   checks ok: $(grep -c '^ok' "$OUT/$GAME.$mode.log"), problems: ${total:-?}  (log: out/sim/$GAME.$mode.log)"
  [ "${total:-1}" = "0" ] || status=1
done
[ $status -eq 0 ] && echo "SIM OK" || echo "SIM: there are problems"
exit $status
