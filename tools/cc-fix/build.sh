#!/bin/sh
# Build docs/cc-fix/tetrio-cc-fix.js (CC 盤面修正, opened from the vA patch's CONFIG).
# The engine comes from the MP4 tool checkout (~/Downloads/tetrio-replay-video, teto port, MIT).
cd "$HOME/Downloads/tetrio-replay-video" || exit 1
npx --prefix tools esbuild ../tetrio-hub/tools/cc-fix/cc-fix-web.js --bundle --format=iife --target=es2022 \
  --alias:chalk=./vendor/triangle/chalk-stub.js --minify --legal-comments=eof \
  --outfile=../tetrio-hub/docs/cc-fix/tetrio-cc-fix.js "$@"
