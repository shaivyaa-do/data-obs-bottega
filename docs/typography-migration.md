<!--
  ~ Licensed to the Apache Software Foundation (ASF) under one
  ~ or more contributor license agreements.  See the NOTICE file
  ~ distributed with this work for additional information
  ~ regarding copyright ownership.  The ASF licenses this file
  ~ to you under the Apache License, Version 2.0 (the
  ~ "License"); you may not use this file except in compliance
  ~ with the License.  You may obtain a copy of the License at
  ~
  ~   http://www.apache.org/licenses/LICENSE-2.0
  ~
  ~ Unless required by applicable law or agreed to in writing,
  ~ software distributed under the License is distributed on an
  ~ "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  ~ KIND, either express or implied.  See the License for the
  ~ specific language governing permissions and limitations
  ~ under the License.
-->

# Typography and text-color tokens

This frontend is Angular + ng-zorro, not MUI. The six-token type scale and
four-opacity text colors still apply. They live in:

| Layer | Path |
| --- | --- |
| TS source of truth | `frontend/src/theme/tokens.ts`, `frontend/src/theme/typography.ts` |
| Live CSS | `:root` in `frontend/src/styles.scss` |
| Legacy CSS aliases | `--app-font-size-*`, `--app-text-*` |

## Type scale

Line-height is **1.4** on every variant. Nothing may be smaller than 11.5px or
larger than 19.5px.

| Variant | Size | Weight | Use |
| --- | --- | --- | --- |
| `labelRegular` | 11.5px | 400 | captions, metadata, timestamps, helper text |
| `labelMedium` | 11.5px | 500 | tags, badges, table headers |
| `bodyRegular` | 13.5px | 400 | default paragraphs and content |
| `bodyMedium` | 13.5px | 500 | buttons, input labels, emphasised inline |
| `bodyLarge` | 15.5px | 500 | card titles, section sub-headers |
| `displayLarge` | 19.5px | 600 | page titles, modal titles |

## Text color

One base, four opacities. Light `#2B2B2B` (`43 43 43`), dark `#FFFFFF`.
Do not hardcode four hex greys.

| Token | Opacity | Use |
| --- | --- | --- |
| `--text-black` | 90% | titles, filled input values, selected/hover text |
| `--text-primary` | 70% | default body, button labels, subtitles |
| `--text-secondary` | 50% | helper copy, inactive nav |
| `--text-tertiary` | 30% | placeholders, tags, disabled, timestamps |

`--text-disabled` aliases `--text-tertiary` for Ant Design internals.

## Legacy alias block

`LEGACY_TYPOGRAPHY_ALIASES` in `typography.ts` and the `--app-*` CSS variables
exist so existing SCSS and ng-zorro components keep compiling while they still
say `body1` / `--app-font-size-body` / `--app-text-primary`.

| Old | New |
| --- | --- |
| h1, h2, h3 | displayLarge |
| h4, h5, h6 | bodyLarge |
| subtitle1, subtitle2 | bodyMedium |
| body1, body2 | bodyRegular |
| button | bodyMedium, no text-transform |
| caption, overline | labelRegular |
| `--app-text-primary` (was 90%) | `--text-black` |
| `--app-text-secondary` (was 70%) | `--text-primary` |
| `--app-text-tertiary` (was 50%) | `--text-secondary` |
| `--app-text-quaternary` / disabled (was 30%) | `--text-tertiary` |

Application code must not add new uses of the old names. The alias file is the
only place allowed to mention them.

## Why the aliases stay

ng-zorro tables, buttons, form labels, tooltips, and tags still set their own
font-size/color. Phase 1 points those internals at the token scale via
`styles.scss` overrides. Removing the aliases before every SCSS file is
migrated would unstyle the app. They come out after the lint sweep (Phase 4)
and inline-override strip (Phase 5).

## Phase 2 — control height and contrast

Body type is 13.5px at 70% opacity. Controls that assumed a 12px / 16px
rhythm are recentered on a **32px** row (`--app-control-height`): default
buttons, inputs, menu items, and dropdown rows. Small (`-sm`) and large
(`-lg`) Ant sizes are left alone.

Where 50% or 70% text fails WCAG AA on the background, escalate
`tertiary → secondary → primary → black`. Do not invent a grey. Helper
copy and list descriptions on white therefore use `--text-primary`.
Branded fills (`#0078d4`, `#e84917`) need `--text-black` or inverted white;
primary buttons already invert to white.
