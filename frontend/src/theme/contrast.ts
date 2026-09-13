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

export type TextToken = "tertiary" | "secondary" | "primary" | "black";

export type Rgb = readonly [number, number, number];

export const TEXT_TOKEN_OPACITY: Record<TextToken, number> = {
  tertiary: 0.3,
  secondary: 0.5,
  primary: 0.7,
  black: 0.9,
};

const TOKEN_ORDER: TextToken[] = ["tertiary", "secondary", "primary", "black"];

export function compositeTextRgb(base: Rgb, opacity: number, background: Rgb): Rgb {
  if (opacity < 0 || opacity > 1) {
    throw new Error(`Opacity must be between 0 and 1, got ${opacity}`);
  }
  return [
    base[0] * opacity + background[0] * (1 - opacity),
    base[1] * opacity + background[1] * (1 - opacity),
    base[2] * opacity + background[2] * (1 - opacity),
  ];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAa(ratio: number, large = false): boolean {
  if (!Number.isFinite(ratio) || ratio < 1) {
    throw new Error(`Contrast ratio must be a finite number >= 1, got ${ratio}`);
  }
  return large ? ratio >= 3 : ratio >= 4.5;
}

export function escalateTextToken(token: TextToken, ratioOk: boolean): TextToken {
  if (ratioOk) {
    return token;
  }
  const index = TOKEN_ORDER.indexOf(token);
  if (index < 0) {
    throw new Error(`Unknown text token: ${String(token)}`);
  }
  return TOKEN_ORDER[Math.min(index + 1, TOKEN_ORDER.length - 1)];
}

export function resolveReadableTextToken(token: TextToken, base: Rgb, background: Rgb, large = false): TextToken {
  let current = token;
  for (let step = 0; step < TOKEN_ORDER.length; step++) {
    const foreground = compositeTextRgb(base, TEXT_TOKEN_OPACITY[current], background);
    if (meetsWcagAa(contrastRatio(foreground, background), large)) {
      return current;
    }
    current = escalateTextToken(current, false);
  }
  return "black";
}
