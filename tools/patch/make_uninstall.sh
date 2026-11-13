#!/bin/sh
# Uninstall launchers (restore the original TETR.IO) from a release folder's vR launchers:
# same payload (install.py --restore), only the start line changes. Upload them to the release.
# Usage: tools/patch/make_uninstall.sh ~/Downloads/all-tetrio-patch/release-v4.NNNN-ARO NNNN
set -eu
DIR=$1; V=$2; mkdir -p "$DIR/uninstall"
for p in Mac:command Linux:sh Windows:cmd; do
  os=${p%%:*}; ext=${p#*:}; src="$DIR/tetrio-patch-$os-vR4.$V.$ext"; dst="$DIR/uninstall/tetrio-patch-$os-UNINSTALL.$ext"
  LC_ALL=C sed -e 's/--kind R/--restore/' -e "s/echo \"tetrio-patch-$os-vR4.$V\"/echo \"tetrio-patch-$os-UNINSTALL (restore the original TETR.IO)\"/" "$src" > "$dst"
  chmod +x "$dst"; LC_ALL=C grep -q -- '--restore' "$dst" || { echo "no restore in $dst" >&2; exit 1; }
done
ls "$DIR/uninstall"
