/**
 * Spanish strings for backend-generated, user-facing content — currently
 * just the session-closure summary text sent to judges/auxiliaries
 * (services/sessionSummary.ts). Separate from tab/src/i18n/es.ts (no
 * shared bundler between backend and tab), same shape/philosophy: the
 * default (and, for now, only) locale, not a placeholder.
 */
export const es = {
  "sessionSummary.title": "Resumen de la sesión",
  "sessionSummary.noHearings": "Sesión finalizada — no se registraron audiencias en esta reunión.",
  "sessionSummary.labelCompleted": "Completada",
  "sessionSummary.labelActive": "Activa (la sesión finalizó mientras estaba activa)",
  "sessionSummary.labelPending": "Pendiente (la sesión finalizó antes de completarse esta audiencia)",
  "sessionSummary.none": "(ninguno)",
  "sessionSummary.hearingLine": "Audiencia #{number} — {label}",
  "sessionSummary.presentLine": "Presentes: {present} ({presentCount}/{expectedCount})",
  "sessionSummary.notesLine": "Sus notas: {notes}",
} as const;
