import { circleDesign } from "../constants/circleDesign";

export function circleHeaderTopInset(safeTop: number, bannerVisible: boolean) {
  return bannerVisible ? circleDesign.space.tight : safeTop;
}

export function circleControlColumns(
  width: number,
  fontScale: number,
  kind: "tabs" | "actions",
) {
  const minimum =
    (kind === "tabs"
      ? circleDesign.minimumTabWidth
      : circleDesign.minimumActionWidth) * Math.max(1, fontScale);
  const gap = circleDesign.space.tight;
  if (kind === "tabs" && width >= minimum * 4 + gap * 3) return 4;
  return width >= minimum * 2 + gap ? 2 : 1;
}
