# Quick Action Button — Design Spec

## Summary

Add a configurable "Quick Action" toolbar button to Agentation that POSTs annotation data to an arbitrary HTTP endpoint. Enables workflows like sending annotations to a chat UI (e.g., fakechat) or any webhook-compatible service.

## New Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `quickActionUrl` | `string` | No | — | POST endpoint URL. Button only appears when this is set. |
| `quickActionPrefix` | `string` | No | `"Fix Me"` | Text prefix prepended to the annotation data in the payload. |
| `quickActionLabel` | `string` | No | `"Fix Me"` | Tooltip text shown on hover. |
| `quickActionIconUrl` | `string` | No | — | URL to a custom icon image. When set, renders `<img>` instead of the default built-in SVG icon. |

## Usage

```tsx
<Agentation
  quickActionUrl="http://localhost:8787"
  quickActionPrefix="Fix this:"
  quickActionLabel="Fix Me"
  quickActionIconUrl="https://example.com/icon.svg"
/>
```

## Button Behavior

### Visibility
- Only rendered when `quickActionUrl` is provided.

### Position
- In the toolbar, after the Send button and before the Clear (trash) button.

### Keyboard Shortcut
- **F** key (when toolbar is active).

### Icon
- Default: built-in wrench SVG icon.
- When `quickActionIconUrl` is set: `<img src={quickActionIconUrl} />` with appropriate sizing (24x24).

### States
Follows the same idle -> sending -> sent/failed pattern as the existing Send button:
- **idle**: Default state, icon visible.
- **sending**: Brief fade during request.
- **sent**: Success indicator, resets to idle after 2.5s.
- **failed**: Failure indicator, resets to idle after 2.5s.

### Disabled When
- No annotations exist.

## What Gets Sent

### Annotation Selection Logic
- If an annotation popup is currently open (viewing/editing a specific annotation): sends **that single annotation**.
- If no popup is open: sends **all annotations**.

### Payload Format
POST request with JSON body:

```json
{
  "text": "<prefix> <annotation markdown>"
}
```

### Annotation Formatting
Reuses the existing `generateOutput` function:
- For a single annotation: calls `generateOutput` with a one-element array.
- For all annotations: calls `generateOutput` with the full array.

The output detail level follows the user's current settings (compact/standard/detailed/forensic).

### Example Payload (single annotation)
```json
{
  "text": "Fix this: ## Page Feedback: /dashboard\n\n1. **<Button>**: 'The hover state is broken' — path: div > nav > button.primary"
}
```

## Files to Modify

1. **`package/src/components/page-toolbar-css/index.tsx`**
   - Add props to `PageFeedbackToolbarCSSProps`
   - Add quick action state (`quickActionState`)
   - Add `sendQuickAction` handler
   - Add button JSX after Send button
   - Add "F" keyboard shortcut handler

2. **`package/src/components/icons.tsx`**
   - Add `IconWrench` SVG component (default icon)

3. **`package/src/components/page-toolbar-css/styles.module.scss`**
   - Add styles for quick action button wrapper (similar to send button conditional visibility)
   - Add styles for custom icon `<img>` sizing

4. **`package/src/index.ts`**
   - No changes needed (props flow through existing `AgentationProps` export)

## API Stability

These are new additive props — no breaking changes. All are optional, so existing consumers are unaffected.

## Testing

1. Run `pnpm build` to verify compilation.
2. In the example app, add the props and verify:
   - Button appears only when `quickActionUrl` is set.
   - Button is disabled with no annotations.
   - Clicking sends correct payload to the endpoint.
   - Keyboard shortcut "F" works.
   - Custom icon renders when `quickActionIconUrl` is provided.
   - Sent/failed states display correctly.
