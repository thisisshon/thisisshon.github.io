# Minimal SaaS Dashboard DESIGN.md

## Product feel

Build a compact, operational SaaS dashboard for teams that need to scan metrics and act quickly.
The interface uses a warm neutral canvas, graphite navigation, and limited electric signal colors.
It should feel calm and precise at rest, then visibly alive around data, changes, and action.
Use hierarchy, alignment, and spacing before decoration.

## Color system

### Brand
- Ink: #171714 — primary actions, navigation, and high-emphasis surfaces
- Signal: #b9f26b — active navigation, positive momentum, and focused highlights
- Data Accent: #6467f2 — charts, selected data, and analytical emphasis

### Surfaces
- Canvas: #f2f0e9 — warm page background
- Surface: #fffefa — cards, panels, inputs, tables
- Surface Hover: #eceae2 — hover rows and secondary controls
- Border: #dcd9cf — card borders and separators

### Text
- Text Primary: #171714 — headings, values, body text
- Text Secondary: #68675f — labels and descriptions
- Text Muted: #9b9a92 — captions, placeholders, disabled text

### Semantic
- Success: #198754 — positive metrics and completed states
- Warning: #c47a0b — caution and pending states
- Danger: #d9534f — errors, destructive actions, negative metrics
- Info: #6467f2 — informational links and selected data

## Dark mode

- Canvas: #11110f
- Surface: #1b1b18
- Surface Hover: #24241f
- Border: #34342e
- Text Primary: #f5f3ea
- Text Secondary: #aaa89f
- Text Muted: #8f8e86
- Keep semantic colors recognizable and test contrast in both themes.
- Do not create dark mode with opacity overlays or inverted screenshots.

## Typography

- Display Font: Inter
- Body Font: Inter
- Code Font: JetBrains Mono
- Use weights 400, 500, 600, and 700 only.
- Use tabular numbers for metrics, prices, percentages, and table values.

### Type scale
- Page Title: 24px / 32px / 600 / -0.025em
- Section Heading: 16px / 24px / 600
- Card Title: 14px / 20px / 600
- Body: 14px / 24px / 400
- Label: 12px / 16px / 500 / 0.05em
- Caption: 12px / 16px / 400
- Data / Mono: 14px / 20px / 500

## Spacing

- Base unit: 4px
- Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px
- Desktop page gutter: 32px
- Mobile page gutter: 16px
- Card padding: 20px
- Dense row padding: 8px 12px
- Section gap: 32px desktop, 24px mobile
- Stat grid gap: 16px

## Border radius

- 4px: badges and compact controls
- 6px: buttons, inputs, selects
- 8px: cards, panels, table shells
- 12px: stat cards and featured panels
- 9999px: avatars and pill badges only

## Elevation

- Default operational surfaces are flat with a 1px border.
- Card hover: 0 1px 3px rgba(0,0,0,0.06)
- Dropdown: 0 4px 12px rgba(0,0,0,0.08)
- Focus: 0 0 0 2px rgba(9,9,11,0.15)
- Never add shadows to every card.

## Layout

- Desktop sidebar width: 240px
- Main content max width: 1280px
- Keep page title and primary action on one baseline.
- Align stat cards, charts, and tables to the same content grid.
- Use a four-column stat grid on wide screens.
- Use a two-column content split for the main chart and recent activity.

## Sidebar navigation

- Group links under compact uppercase labels.
- Navigation item height: 36px
- Default item uses transparent background and Text Secondary.
- Hover item uses Surface Hover.
- Active item uses Brand Primary with white text.
- Keep icon, label, and active indicator aligned.
- On tablet collapse to icon navigation or a drawer.
- On mobile use a modal drawer and preserve keyboard focus.

## Top bar

- Keep the page title left and one primary action right.
- Search and secondary filters sit before destructive or account actions.
- Avoid marketing copy inside the authenticated shell.

## Buttons

- Primary: Ink background, Canvas text, 6px radius.
- Secondary: Surface background, Border outline, Text Primary.
- Ghost: transparent background, Text Secondary.
- Destructive: Danger text and border; use filled danger only for confirmation.
- Heights: 32px small, 36px medium, 40px large.
- Include hover, active, focus-visible, disabled, and loading states.
- One filled primary action per section.

## Inputs and search

- Surface background, 1px Border, 6px radius.
- Horizontal padding: 12px; vertical padding: 8px.
- Focus uses Text Primary border and the defined focus ring.
- Error uses Danger border plus visible helper text.
- Disabled fields keep readable labels and reduced contrast.
- Search includes a magnifying-glass icon and keyboard shortcut when available.

## Stat cards

- Anatomy: label, large value, optional trend, optional supporting period.
- Value: 28px / 600 with tabular numbers.
- Label: 12px Text Secondary.
- Trend: 11px with icon or explicit plus/minus text.
- Use semantic color only on the trend, not the whole card.
- Skeleton must preserve the final card geometry.

## Charts

- Use neutral grid lines, Data Accent for the series, and Signal only for the current point.
- Avoid rainbow palettes or decorative gradients for a single metric.
- Labels and legends use 11–12px text.
- Tooltips use Surface, Border, 8px radius, and Dropdown elevation.
- Always provide a text summary or accessible data table.

## Data table

- Table header height: 36px
- Table row height: 40px
- Header text: 12px / 500 / Text Secondary
- Body text: 13–14px / Text Primary
- Use row hover, selected row, sorting, pagination, and visible row actions.
- Keep status as text plus semantic badge.
- Empty state belongs inside the table shell.
- On small screens allow horizontal scrolling; keep the first column sticky when useful.

## Badges and status

- Success: green text on subtle green background.
- Warning: amber text on subtle amber background.
- Danger: red text on subtle red background.
- Info: blue text on subtle blue background.
- Neutral: Text Secondary on Surface Hover.
- Never communicate state with color alone.

## States

### Loading
- Skeletons mirror real dashboard geometry.
- Do not use brand-colored skeletons.

### Empty
- Explain what is missing and offer one relevant action.
- Keep empty states compact inside operational screens.

### Error
- State what failed and provide a retry path.
- Preserve entered form data when possible.

### Success
- Confirm the action near the affected surface.
- Do not block the whole page for routine success feedback.

### Disabled
- Keep labels readable and expose why the action is unavailable.

## Responsive behavior

- Desktop above 1024px: persistent 240px sidebar and four stat columns.
- Tablet 768–1024px: collapsible sidebar and two stat columns.
- Mobile below 768px: drawer navigation and one stat column.
- Stack title/actions when they no longer fit on one row.
- Tables scroll inside their shell, never the whole page.
- Charts retain labels and do not crop their highlighted series.
- Preview surfaces scale proportionally without hiding the primary dashboard area.

## Accessibility

- All controls are keyboard reachable.
- Use visible focus states on every interactive element.
- Maintain 4.5:1 contrast for body text.
- Use semantic headings and real table markup.
- Icon-only buttons require accessible labels.
- Status always includes text or an icon, never color alone.
- Respect prefers-reduced-motion.
- Announce loading and error states where appropriate.

## Motion

- Use 120–180ms transitions for hover and pressed states.
- Avoid layout-shifting entrance animation in dashboards.
- Disable non-essential motion under prefers-reduced-motion.

## Agent implementation checklist

- Read this file before generating UI.
- Use the exact token values and spacing scale.
- Preserve the 240px desktop sidebar.
- Preserve compact 40px table rows.
- Use one primary action per section.
- Include loading, empty, error, success, disabled, hover, active, and focus states.
- Test desktop, tablet, mobile, light mode, dark mode, and keyboard navigation.

## Do

- Keep one primary action per section.
- Preserve compact dashboard density.
- Use semantic colors only for meaning.
- Align charts and tables to the same content grid.
- Use visible focus states.
- Keep numeric values tabular and scannable.
- Use consistent 4px spacing increments.
- Group related metrics with clear hierarchy.

## Don't

- Don't place a marketing hero inside the authenticated dashboard.
- Don't add decorative gradients or generic glassmorphism.
- Don't use oversized radii on operational surfaces.
- Don't use arbitrary Tailwind colors.
- Don't nest cards more than two levels.
- Don't communicate status with color alone.
- Don't add giant empty padding between dashboard blocks.
- Don't add decorative illustrations to dashboard chrome.

## License

MIT
