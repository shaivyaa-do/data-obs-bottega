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

import {
  LEGACY_TYPOGRAPHY_ALIASES,
  LEGACY_VARIANT_REPLACEMENT,
  TYPE_SCALE,
  resolveTypographyVariant,
  typeTokenForFontSize,
  typeWeight,
  typography,
} from "./typography";

describe("TYPE_SCALE", () => {
  it("exposes six variants, all at line-height 1.4, none outside 11.5–19.5px", () => {
    const names = Object.keys(TYPE_SCALE);
    expect(names).toEqual(["labelRegular", "labelMedium", "bodyRegular", "bodyMedium", "bodyLarge", "displayLarge"]);
    for (const variant of Object.values(TYPE_SCALE)) {
      expect(variant.lineHeight).toBe(1.4);
      const px = parseFloat(variant.fontSize);
      expect(px).toBeGreaterThanOrEqual(11.5);
      expect(px).toBeLessThanOrEqual(19.5);
    }
  });

  it("maps legacy heading/body names onto the token scale", () => {
    expect(LEGACY_TYPOGRAPHY_ALIASES.h1).toEqual(TYPE_SCALE.displayLarge);
    expect(LEGACY_TYPOGRAPHY_ALIASES.body1).toEqual(TYPE_SCALE.bodyRegular);
    expect(LEGACY_TYPOGRAPHY_ALIASES.caption).toEqual(TYPE_SCALE.labelRegular);
    expect(LEGACY_TYPOGRAPHY_ALIASES.button.fontWeight).toBe(500);
  });

  it("does not invent a size between tokens", () => {
    expect(TYPE_SCALE.bodyRegular.fontSize).not.toBe(TYPE_SCALE.labelRegular.fontSize);
    expect(Object.values(TYPE_SCALE).map(v => v.fontSize)).toEqual(["11.5px", "11.5px", "13.5px", "13.5px", "15.5px", "19.5px"]);
  });
});

describe("resolveTypographyVariant", () => {
  it("accepts only the six public tokens", () => {
    expect(Object.keys(typography).filter(key => key !== "fontFamily")).toEqual(Object.keys(TYPE_SCALE));
    expect(resolveTypographyVariant("bodyRegular")).toBe("bodyRegular");
    expect("body1" in typography).toBe(false);
  });

  it("rejects legacy names with the Phase 1 replacement", () => {
    expect(LEGACY_VARIANT_REPLACEMENT.body1).toBe("bodyRegular");
    expect(LEGACY_VARIANT_REPLACEMENT.h1).toBe("displayLarge");
    expect(() => resolveTypographyVariant("body1")).toThrow(/Use "bodyRegular"/);
    expect(() => resolveTypographyVariant("caption")).toThrow(/Use "labelRegular"/);
  });

  it("rejects an unknown variant", () => {
    expect(() => resolveTypographyVariant("hero")).toThrow(/Unknown typography variant/);
  });
});

describe("typeTokenForFontSize", () => {
  it("rounds sizes between tokens down and clamps to 11.5–19.5", () => {
    expect(typeTokenForFontSize(9.5)).toBe("labelRegular");
    expect(typeTokenForFontSize(12)).toBe("labelRegular");
    expect(typeTokenForFontSize(13)).toBe("labelRegular");
    expect(typeTokenForFontSize(13.5)).toBe("bodyRegular");
    expect(typeTokenForFontSize(14)).toBe("bodyRegular");
    expect(typeTokenForFontSize(15.5)).toBe("bodyLarge");
    expect(typeTokenForFontSize(16)).toBe("bodyLarge");
    expect(typeTokenForFontSize(18)).toBe("bodyLarge");
    expect(typeTokenForFontSize(19.5)).toBe("displayLarge");
    expect(typeTokenForFontSize(45.7)).toBe("displayLarge");
  });

  it("rejects a non-finite size", () => {
    expect(() => typeTokenForFontSize(Number.NaN)).toThrow(/finite/);
    expect(() => typeTokenForFontSize(-1)).toThrow(/negative/);
  });
});

describe("typeWeight", () => {
  it("snaps to 400, 500, or 600, rounding down between them", () => {
    expect(typeWeight(400)).toBe(400);
    expect(typeWeight(510)).toBe(500);
    expect(typeWeight(590)).toBe(500);
    expect(typeWeight(600)).toBe(600);
    expect(typeWeight(700)).toBe(600);
  });

  it("rejects a non-positive weight", () => {
    expect(() => typeWeight(0)).toThrow(/weight/);
  });
});
