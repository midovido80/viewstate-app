export function textDirectionStyle(isRTL: boolean, platform: string) {
  return {
    textAlign: isRTL ? ("right" as const) : ("left" as const),
    writingDirection: isRTL ? ("rtl" as const) : ("ltr" as const),
    // RN 0.81 Android resolves left/right relative to the paragraph's layout direction.
    direction:
      platform === "android"
        ? ("ltr" as const)
        : isRTL
          ? ("rtl" as const)
          : ("ltr" as const),
  };
}
