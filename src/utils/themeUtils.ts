/**
 * Theme utilities for resolving CSS variables into raw color strings.
 * Canvas/SVG APIs can't use var() — these helpers resolve them at runtime.
 */

/** Read a single CSS variable value from :root. */
export function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export interface CanvasTheme {
  waveformColor: string;
  waveformBg: string;
  playhead: string;
  accentIndigo: string;
  regionStart: string;
  regionEnd: string;
  chopLine: string;
  success: string;
  danger: string;
  warning: string;
  vuGreenBright: string;
  vuYellowBright: string;
  vuRedBright: string;
  deep: string;
  inset: string;
  eqLow: string;
  eqMid: string;
  eqHigh: string;
  knobTrack: string;
  textPrimary: string;
  textMuted: string;
  textFaint: string;
  overlay: string;
  overlayHover: string;
  border: string;
  borderStrong: string;
}

/** Resolve all canvas-relevant CSS variables in one call. */
export function getCanvasTheme(): CanvasTheme {
  return {
    waveformColor: getCSSVar('--waveform-color'),
    waveformBg: getCSSVar('--waveform-bg'),
    playhead: getCSSVar('--playhead'),
    accentIndigo: getCSSVar('--accent-indigo'),
    regionStart: getCSSVar('--region-start'),
    regionEnd: getCSSVar('--region-end'),
    chopLine: getCSSVar('--chop-line'),
    success: getCSSVar('--success'),
    danger: getCSSVar('--danger'),
    warning: getCSSVar('--warning'),
    vuGreenBright: getCSSVar('--vu-green-bright'),
    vuYellowBright: getCSSVar('--vu-yellow-bright'),
    vuRedBright: getCSSVar('--vu-red-bright'),
    deep: getCSSVar('--deep'),
    inset: getCSSVar('--inset'),
    eqLow: getCSSVar('--eq-low'),
    eqMid: getCSSVar('--eq-mid'),
    eqHigh: getCSSVar('--eq-high'),
    knobTrack: getCSSVar('--knob-track'),
    textPrimary: getCSSVar('--text-primary'),
    textMuted: getCSSVar('--text-muted'),
    textFaint: getCSSVar('--text-faint'),
    overlay: getCSSVar('--overlay'),
    overlayHover: getCSSVar('--overlay-hover'),
    border: getCSSVar('--border'),
    borderStrong: getCSSVar('--border-strong'),
  };
}
