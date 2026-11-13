// Default face privacy preferences for blog drafts.
// All processing is local to the visitor's browser, before any AI request.
// Original files stay in memory only until the photo is removed, the draft is
// reset, or the page is closed; they are not copied into exported documents.
export const FACE_MOSAIC_SETTINGS = Object.freeze({
  target: 'all',
  style: 'pixel',
  defaultEnabled: true,
  retainOriginalDuringSession: true,
  blocksAcrossFace: 10
});
