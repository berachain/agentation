#!/bin/sh
# Setup agentation skills for Claude Code
# Run from your project root: npx agentation-setup-skills

# Resolve the real path of this script (follows symlinks from .bin/)
SCRIPT="$0"
while [ -L "$SCRIPT" ]; do
  DIR="$(cd "$(dirname "$SCRIPT")" && pwd)"
  SCRIPT="$(readlink "$SCRIPT")"
  case "$SCRIPT" in
    /*) ;;
    *) SCRIPT="$DIR/$SCRIPT" ;;
  esac
done

PACKAGE_DIR="$(cd "$(dirname "$SCRIPT")/.." && pwd)"
SKILLS_SRC="$PACKAGE_DIR/skills"
SKILLS_DEST=".claude/skills"

if [ ! -d "$SKILLS_SRC" ]; then
  echo "Error: skills directory not found at $SKILLS_SRC"
  exit 1
fi

mkdir -p "$SKILLS_DEST"

for skill in "$SKILLS_SRC"/*.md; do
  name="$(basename "$skill")"
  if [ -e "$SKILLS_DEST/$name" ]; then
    echo "  skip: $name (already exists)"
  else
    cp "$skill" "$SKILLS_DEST/$name"
    echo "  added: $name"
  fi
done

echo ""
echo "Done! Skills installed to $SKILLS_DEST/"
echo "Claude Code will automatically pick them up."
