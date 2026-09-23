# Frontend Design System (Helios / Kouventa Chat UI)

Source of truth: this file, plus `frontend-design-reference/logo.webp` and `frontend-design-reference/screenshot-1.png`.
Colors marked *(exact)* are the original CSS token values from the production app's stylesheet (the DevTools export is no longer kept); colors marked *(sampled)* were sampled from screenshot pixels.

Apply these rules to all frontend work. Do not introduce new brand colors. Use the tokens below.

## 1. Brand Colors

| Token | Hex | Usage |
|---|---|---|
| `--color-primary` | `#0EC83A` *(exact)* | Brand green: primary buttons, active tabs, active nav item, avatars, outgoing chat bubbles, focus outlines |
| `--color-default` (light) | `#475569` *(exact)* | Default text color in light theme (slate-600) |
| `--border-color-default` | `#AAABB24D` *(exact)* | Default border (`#AAABB2` at 30% alpha) |
| Neutral gray | `#AAABB2` *(sampled)* | Sidebar dividers, quick-reply button fill |
| Danger / Expired | `#F44336` *(sampled)* | Expired badges, destructive states |
| Online indicator | `#07BC0C` *(sampled)* | Presence dot on the user avatar |

- Focus outline: `outline-color: var(--color-primary)` on all elements.
- Do not use any other green. Use `#0EC83A` exactly.

## 2. Dark Theme (default for the app shell)

```css
--background-primary: rgb(30, 30, 30);              /* #1E1E1E page background */
--background-secondary: rgb(44, 44, 44);            /* #2C2C2C cards, panels, sidebar, footer */
--background-secondary-transparent: rgba(44, 44, 44, 0.8);
--color-default: rgb(255, 255, 255);                /* #FFFFFF primary text */
--color-secondary: rgba(197, 196, 196, 0.3);        /* muted text / subtle fills */
--color-secondary-light: rgb(61, 61, 61);           /* #3D3D3D hover, selected row, chat canvas, dividers */
--scrollbar-track-color: rgba(255, 255, 255, 0.05);
--scrollbar-thumb-color: rgba(255, 255, 255, 0.5);
--leaflet-theme: invert(100%) hue-rotate(180deg) brightness(100%) contrast(90%); /* maps in dark mode */
```

Surface layering, from darkest to lightest:

| Layer | Hex | Where |
|---|---|---|
| Page background | `#1E1E1E` | Behind all cards |
| Top header bar | `#292929` *(sampled)* | Breadcrumb/header card |
| Panels | `#2C2C2C` | Left sidebar, tab bar, chat list, footer, search input bg |
| Raised / selected | `#3D3D3D` | Selected conversation row, chat message canvas, panel dividers |
| Input border | `#525355` *(sampled)* | Search field outline |

Text on dark surfaces:
- Primary: `#FFFFFF` (names, tab labels, headings)
- Secondary: light gray (`#C5C4C4` or white at reduced opacity) for timestamps, previews, subtitles such as "Expires in 23:50:04"
- Active/selected label: `#0EC83A`

## 3. Logo

- File: `frontend-design-reference/logo.webp` (64×79 px, transparent background).
- Mark: a stylized geometric **"K"**. A solid vertical bar in `#0EC83A` sits on the left, and a lighter tint of the same green (≈`#83E399`) forms the angled chevron on the right.
- Placement: top of the left sidebar, centered, about 44px wide, on `#2C2C2C`.
- Do not recolor, stretch, or add effects. Keep clear space of at least 8px around it.

## 4. Typography

- UI font: `Roboto, "Roboto Fallback"` (via Next.js font module), normal style.
- Fallback stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"`. Prefix with `NotoColorEmojiLimited` for emoji.
- Base `line-height: 1.5` (24px on 16px body).

## 5. Status Badges

| Status | Background | Text | Shape |
|---|---|---|---|
| Expired | `#F44336` | `#FFFFFF` | Small pill/rounded rect (~4px radius), compact padding (~2px 8px), ~14px text, right-aligned under the timestamp |
| Notification count | `#0EC83A` (lighter, ≈`#28D150` on the icon overlay) | `#FFFFFF` | Circle/pill on the top-right of the bell icon |
| Online presence | `#07BC0C` | n/a | Small dot at the bottom-right of the avatar, with a dark ring |

When adding new statuses, keep the same pill shape and white text. Suggested mapping: success/active → `#0EC83A`, error/expired → `#F44336`, neutral → `#AAABB2`.

## 6. Chat Bubbles & Conversation UI

**Outgoing / business message bubble (template)**
- Background: `#0EC83A` (solid brand green)
- Text: `#FFFFFF`, ~18px, generous line spacing. Blank lines separate paragraphs.
- Wide bubble (~65% of the chat canvas), right-aligned, square-ish corners (small radius)
- May contain a header image/media at the top, emoji-prefixed detail lines (📅 🕙 📍), and a footer/sender line (e.g. "QA Developer")

**Quick-reply / CTA buttons inside the bubble**
- Full bubble width, stacked with ~6px gaps
- Background: `#AAABB2` (neutral gray), text `#FFFFFF`, centered, with a leading reply-arrow icon
- Rounded ~4px

**Chat canvas**
- Background: `#3D3D3D`
- Scroll-to-bottom FAB: circular, `#2C2C2C` background, white chevron-down icon, bottom-right

**Chat header**
- Avatar (green circle with white initials) + name (white) + subtitle ("Expires in HH:MM:SS", muted gray)
- Primary action button on the right ("Take Over"): `#0EC83A` background, white text, ~4px radius

## 7. Components

**Avatars**: circle, `#0EC83A` fill, white uppercase 2-letter initials (e.g. "ME", "CA", "ND"), ~56px in lists, ~48px in header.

**Conversation list item**: avatar left. Name (white, bold-ish) with timestamp right-aligned (muted). Preview line (muted) with status badge on the right. A thin divider, then a channel row showing the WhatsApp icon (green) and the account name, truncated with ellipsis. The selected item uses a `#3D3D3D` rounded card.

**Tabs** (platform tabs and Assigned/Idle/Bot/Closed):
- Inactive: white text, no underline
- Active: `#0EC83A` text + 2–3px `#0EC83A` bottom border
- Bar background `#2C2C2C`, with a bottom divider in `#3D3D3D`

**Left navigation sidebar**: `#2C2C2C`, icon-only (white outline icons). The active item is a rounded square filled with `#0EC83A`. Groups are separated by short `#AAABB2` horizontal rules. A search button with an outlined rounded box sits at the top.

**Top header**: `#292929` rounded card with breadcrumb (`Interactions > Chat`, light gray). Right side: monitor icon, bell with count badge, user avatar with online dot.

**Inputs**: dark (`#2C2C2C`) background, 1px `#525355` border, ~6px radius, leading search icon, placeholder in muted gray. Filter icon button beside it.

**Dropdown** ("11 Selected Account(s)"): muted text + chevron, separated from tabs by a vertical divider.

**Cards / panels**: rounded (~8px), no heavy borders. Use elevation `shadow-md`: `0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a`.

**Footer**: `#2C2C2C` strip, right-aligned muted text: "Copyright © 2026: PT Helios Informatika Nusantara".

## 8. Implementation Notes

- The stack uses Tailwind CSS. Use utility classes (`flex`, `items-center`, `justify-center`, `w-full`, `h-full`, `divide-y`, `shadow-md`, `text-default`) together with the CSS variables above.
- Define tokens once in `:root` (light) and in a dark-theme scope. Components must reference the variables, not raw hex values.
- Default `box-sizing: border-box`. Borders default to `0` width with `var(--border-color-default)` color.
- Style scrollbars with `--scrollbar-track-color` / `--scrollbar-thumb-color`.
