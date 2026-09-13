/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

export const TYPE_SCALE = {
  labelRegular: { fontSize: "11.5px", lineHeight: 1.4, fontWeight: 400 },
  labelMedium: { fontSize: "11.5px", lineHeight: 1.4, fontWeight: 500 },
  bodyRegular: { fontSize: "13.5px", lineHeight: 1.4, fontWeight: 400 },
  bodyMedium: { fontSize: "13.5px", lineHeight: 1.4, fontWeight: 500 },
  bodyLarge: { fontSize: "15.5px", lineHeight: 1.4, fontWeight: 500 },
  displayLarge: { fontSize: "19.5px", lineHeight: 1.4, fontWeight: 600 },
} as const;

export type TypographyVariant = keyof typeof TYPE_SCALE;

export const FONT_FAMILY =
  '"SF Pro", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * LEGACY ALIASES — DO NOT USE IN APPLICATION CODE.
 * These exist only so ng-zorro / Ant Design internals that still assume a
 * heading/body/caption ladder resolve to the six-token scale. See
 * docs/typography-migration.md.
 */
export const LEGACY_TYPOGRAPHY_ALIASES = {
  h1: TYPE_SCALE.displayLarge,
  h2: TYPE_SCALE.displayLarge,
  h3: TYPE_SCALE.displayLarge,
  h4: TYPE_SCALE.bodyLarge,
  h5: TYPE_SCALE.bodyLarge,
  h6: TYPE_SCALE.bodyLarge,
  subtitle1: TYPE_SCALE.bodyMedium,
  subtitle2: TYPE_SCALE.bodyMedium,
  body1: TYPE_SCALE.bodyRegular,
  body2: TYPE_SCALE.bodyRegular,
  button: { ...TYPE_SCALE.bodyMedium, textTransform: "none" as const },
  caption: TYPE_SCALE.labelRegular,
  overline: { ...TYPE_SCALE.labelRegular, textTransform: "none" as const },
} as const;

export const typography = {
  fontFamily: FONT_FAMILY,
  ...TYPE_SCALE,
  ...LEGACY_TYPOGRAPHY_ALIASES,
};

export const HTML_VARIANT_MAPPING: Record<TypographyVariant, string> = {
  displayLarge: "h1",
  bodyLarge: "h2",
  bodyMedium: "p",
  bodyRegular: "p",
  labelMedium: "span",
  labelRegular: "span",
};
