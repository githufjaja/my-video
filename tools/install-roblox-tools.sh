#!/bin/bash
# Інструменти агента roblox-dev: Rojo (збирає код у файл гри .rbxlx) і luau-lsp (перевірка типів
# з довідником API Roblox).
# Ставляться в ~/.local/bin; ідемпотентно — повторний запуск нічого не качає.
set -euo pipefail
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
ROJO=7.5.1
DEFS="$HOME/.local/share/roblox/globalTypes.d.luau"

get() { curl -fsSL --retry 3 -o "$TMP/a.zip" "$1" && unzip -oq "$TMP/a.zip" -d "$TMP/x"; }

if ! "$BIN/rojo" --version 2>/dev/null | grep -q "$ROJO"; then
  get "https://github.com/rojo-rbx/rojo/releases/download/v$ROJO/rojo-$ROJO-linux-x86_64.zip"
  install -m 755 "$TMP/x/rojo" "$BIN/rojo"; rm -rf "$TMP/x"
fi
if [ ! -x "$BIN/luau-lsp" ]; then
  get "https://github.com/JohnnyMorganz/luau-lsp/releases/latest/download/luau-lsp-linux-x86_64.zip"
  install -m 755 "$TMP/x/luau-lsp" "$BIN/luau-lsp"; rm -rf "$TMP/x"
fi
# довідник API Roblox для перевірки типів (оновлюємо раз на тиждень)
if [ ! -s "$DEFS" ] || [ -n "$(find "$DEFS" -mtime +7 2>/dev/null)" ]; then
  mkdir -p "$(dirname "$DEFS")"
  curl -fsSL --retry 3 -o "$DEFS" https://raw.githubusercontent.com/JohnnyMorganz/luau-lsp/main/scripts/globalTypes.d.luau
fi
"$BIN/rojo" --version; "$BIN/luau-lsp" --version
