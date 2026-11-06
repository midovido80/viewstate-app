/** Exact palette of the approved ViewState Next interactive reference. */
export const nextDesign = {
  blue: "#2454ED",
  navy: "#18355C",
  ink: "#1B2940",
  red: "#A83B48",
  green: "#087F5B",
  background: "#F5F7FC",
  border: "#DFE5EF",
  muted: "#607086",
  soft: "#EDF2FF",
  white: "#FFFFFF",
} as const;
/** Only numeric sets become grids. Preserve full labels for descriptive options. */
export function isNumericChoiceSet(values: readonly string[]): boolean {
  return (
    values.some((value) => /^\d+$/.test(value)) &&
    values.every(
      (value) => value === "" || value === "manual" || /^\d+$/.test(value),
    )
  );
}
