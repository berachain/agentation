#!/bin/sh
# Setup agentation skills for Claude Code
# Run from your project root: npx @berachain/agentation-setup-skills

PACKAGE_DIR="$(dirname "$(dirname "$0")")"
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
