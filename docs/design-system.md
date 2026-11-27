# TRILLION design system

Interaction model mirrors a calm, text-thread workspace: a chat thread with short bubbles, live task
cards you can watch, approval cards for consequential actions, a Home of glanceable panels, and Projects
as separate workspaces. Original TRILLION branding and assets only.

## Logo

`docs/brand/trillion-logo-full.png`: deep-green rounded tile with a white T and an emerald page-curl, TRILLION wordmark below. App icon, adaptive icon (bg `#062A1E`), splash and `logo-mark.png` live in `apps/mobile/assets`. Never recolour or redraw it.

## Colour (light theme)

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FFFFFF` | App background |
| `surface` | `#F6FBF8` | Cards, composer |
| `surfaceAlt` | `#ECF7F1` | User bubble, selected rows |
| `border` | `#DCEFE4` | Hairlines |
| `brandDeep` | `#062A1E` | Logo tile, adaptive icon background |
| `brandMid` | `#0A4A33` | Dark accents, headers on emphasis |
| `primary` | `#10B981` | Accent, send button, active states |
| `primaryDark` | `#047857` | Pressed, links |
| `primarySoft` | `#D1FAE5` | Chips, badges |
| `text` | `#0B1F17` | Body text |
| `textMuted` | `#5B6B63` | Secondary text |
| `danger` | `#DC2626` | Errors, destructive |

## Type
Inter (or system). 28/34 display, 17/24 body, 15/20 secondary, 13/18 caption. Generous spacing (8pt grid), 16 radius cards, 22 radius bubbles.

## Core components
- **Thread**: assistant text left, no bubble chrome; user bubble right on `surfaceAlt`.
- **Composer**: pill input, attach, model/mode chip, round emerald send.
- **Task card**: title, live step, status pill (queued, running, waiting approval, done, failed, cancelled), Stop.
- **Approval card**: what will happen, estimated credits, Approve (emerald) / Decline.
- **Panel**: Home tile with title, one big value, updated time.
- **Top bar**: Home (left), title, search + profile (right).
