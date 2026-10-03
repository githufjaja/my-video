#!/bin/bash
# Перевірка й збірка гри Roblox (проект Rojo).
#   tools/roblox-check.sh games/<гра>   →   перевірка типів + out/<гра>.rbxlx
# Файл .rbxlx власник відкриває в Roblox Studio (File → Open from File).
set -uo pipefail
DIR="${1:?usage: tools/roblox-check.sh games/<game>}"
NAME=$(basename "$DIR")
BIN="$HOME/.local/bin"
DEFS="$HOME/.local/share/roblox/globalTypes.d.luau"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$ROOT/out"
cd "$DIR" || exit 1

"$BIN/rojo" sourcemap default.project.json -o sourcemap.json >/dev/null || exit 1
echo "== перевірка типів (luau-lsp)"
"$BIN/luau-lsp" analyze --platform=roblox --definitions="$DEFS" --sourcemap=sourcemap.json src 2>&1 | grep -v -e '^\[INFO\]' -e '^\[WARN\]'
CHECK=${PIPESTATUS[0]}
echo "== збірка (rojo)"
"$BIN/rojo" build default.project.json -o "$ROOT/out/$NAME.rbxlx" || exit 1
[ "$CHECK" -eq 0 ] && echo "OK: помилок немає" || echo "Є зауваження перевірки — виправ перед здачею"
exit "$CHECK"
