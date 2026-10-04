export type PreviewZoomAnchor = {
  anchorClientX: number;
  anchorClientY: number;
  currentScale: number;
  stageLeft: number;
  stageTop: number;
};

export function calculateAnchoredScroll({
  anchorClientX,
  anchorClientY,
  currentScale,
  stageLeft,
  stageTop,
}: PreviewZoomAnchor) {
  const safeScale = Math.max(currentScale, 0.01);
  return {
    logicalX: (anchorClientX - stageLeft) / safeScale,
    logicalY: (anchorClientY - stageTop) / safeScale,
  };
}

