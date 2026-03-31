#!/bin/sh
# Setup agentation skills and hooks for Claude Code
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
HOOKS_SRC="$PACKAGE_DIR/hooks"
SKILLS_DEST=".claude/skills"
HOOKS_DEST=".claude/hooks"
SETTINGS_FILE=".claude/settings.json"

# --- Install skills ---
if [ ! -d "$SKILLS_SRC" ]; then
  echo "Error: skills directory not found at $SKILLS_SRC"
  exit 1
fi

mkdir -p "$SKILLS_DEST"

echo "Skills:"
for skill in "$SKILLS_SRC"/*.md; do
  filename="$(basename "$skill" .md)"
  skill_dir="$SKILLS_DEST/$filename"
  if [ -e "$skill_dir/SKILL.md" ]; then
    echo "  skip: $filename (already exists)"
  else
    # Migrate standalone .md file if it exists from older versions
    if [ -f "$SKILLS_DEST/$filename.md" ] && [ ! -d "$skill_dir" ]; then
      mkdir -p "$skill_dir"
      mv "$SKILLS_DEST/$filename.md" "$skill_dir/SKILL.md"
      echo "  migrated: $filename.md -> $filename/SKILL.md"
    else
      mkdir -p "$skill_dir"
      cp "$skill" "$skill_dir/SKILL.md"
      echo "  added: $filename/SKILL.md"
    fi
  fi
done

# --- Install hooks ---
if [ -d "$HOOKS_SRC" ]; then
  mkdir -p "$HOOKS_DEST"

  echo ""
  echo "Hooks:"
  for hook in "$HOOKS_SRC"/*.sh; do
    name="$(basename "$hook")"
    if [ -e "$HOOKS_DEST/$name" ]; then
      echo "  skip: $name (already exists)"
    else
      cp "$hook" "$HOOKS_DEST/$name"
      chmod +x "$HOOKS_DEST/$name"
      echo "  added: $name"
    fi
  done

  # --- Register hooks in settings.json ---
  echo ""
  echo "Settings:"

  # Create settings.json if it doesn't exist
  if [ ! -f "$SETTINGS_FILE" ]; then
    echo '{}' > "$SETTINGS_FILE"
    echo "  created: $SETTINGS_FILE"
  fi

  # Use node (available in any npm project) to safely merge the hook config
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));

    // Ensure hooks.UserPromptSubmit exists
    if (!settings.hooks) settings.hooks = {};
    if (!Array.isArray(settings.hooks.UserPromptSubmit)) settings.hooks.UserPromptSubmit = [];

    const hookCommand = '.claude/hooks/check-agentation.sh';
    const alreadyExists = settings.hooks.UserPromptSubmit.some(rule =>
      rule.hooks && rule.hooks.some(h => h.command === hookCommand)
    );

    if (alreadyExists) {
      console.log('  skip: UserPromptSubmit hook (already registered)');
    } else {
      settings.hooks.UserPromptSubmit.push({
        matcher: '',
        hooks: [{ type: 'command', command: hookCommand }]
      });
      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
      console.log('  added: UserPromptSubmit hook for check-agentation.sh');
    }
  "
fi

echo ""
echo "Done! Agentation is set up for Claude Code."
echo "Skills: $SKILLS_DEST/"
echo "Hooks:  $HOOKS_DEST/"
echo "Claude Code will automatically pick them up."
