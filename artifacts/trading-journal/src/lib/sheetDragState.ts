// Module-level flag: true while a BottomSheet is being finger-dragged.
// CustomChart's scheduleChartUpdate checks this and skips series.update()
// during drag so the chart canvas doesn't repaint and compete with the
// sheet's GPU compositor animation.
//
// flush: CustomChart registers its scheduleChartUpdate here so the sheet
// can trigger a chart flush immediately when drag ends (processes any bar
// that accumulated in pendingChartBarRef during the suppressed window).

export const sheetDragState: {
  active: boolean;
  flush: (() => void) | null;
} = {
  active: false,
  flush: null,
};
