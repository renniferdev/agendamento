import type { CSSProperties } from "react";

/**
 * Deriva o tema da página pública a partir da cor de cada estabelecimento,
 * garantindo contraste legível mesmo com cores muito claras (amarelo, rosa
 * pastel etc.).
 */

type Rgb = [number, number, number];

const FALLBACK: Rgb = [79, 70, 229];
const WHITE: Rgb = [255, 255, 255];
const DARK: Rgb = [22, 32, 47];

function parseHex(color: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].replace(/./g, "$&$&") : match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

const toHex = (rgb: Rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Luminância relativa e razão de contraste conforme a WCAG. */
function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const mix = (a: Rgb, b: Rgb, amountOfA: number) =>
  a.map((v, i) => v * amountOfA + b[i] * (1 - amountOfA)) as Rgb;

export function brandTheme(color: string): CSSProperties {
  const brand = parseHex(color) ?? FALLBACK;
  const onBrand = contrast(brand, WHITE) >= contrast(brand, DARK) ? WHITE : DARK;
  const soft = mix(brand, WHITE, 0.1);

  // Versão da cor usável como texto/borda: escurece até ler bem sobre o fundo suave.
  let ink = brand;
  while (contrast(ink, soft) < 4.5) ink = mix(ink, [0, 0, 0], 0.9);

  return {
    "--brand": toHex(brand),
    "--on-brand": toHex(onBrand),
    "--brand-ink": toHex(ink),
    "--brand-soft": toHex(soft),
    // Os componentes compartilhados (links, foco dos campos) usam "teal".
    "--color-teal": toHex(ink),
    "--color-teal-dark": toHex(mix(ink, [0, 0, 0], 0.85)),
    "--color-teal-light": toHex(soft),
  } as CSSProperties;
}
