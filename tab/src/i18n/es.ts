/**
 * Spanish strings — the default (and, for now, only) locale. Every key
 * used anywhere in the tab lives here, flat and namespaced by component,
 * so `keyof typeof es` gives every call site autocomplete + a compile
 * error on a typo'd key. Interpolation uses `{name}` placeholders, filled
 * in by `t()` (./index.ts).
 */
export const es = {
  // --- shared actions (icon button titles, prompts) ---
  "common.call": "Llamar",
  "common.message": "Mensaje",
  "common.mute": "Silenciar",
  "common.cameraOff": "Apagar cámara",
  "common.callPhase2": "Las llamadas son una función de la Fase 2 (aún no implementada).",
  "common.messagePromptTo": "Mensaje para {name}:",

  // --- roles (JudgeRole and PartyRole enum values) ---
  "roles.JUDGE": "Juez",
  "roles.PRESIDING_JUDGE": "Juez Presidente",
  "roles.SECRETARY": "Secretario",
  "roles.OTHER_OFFICER": "Otro funcionario",
  "roles.PARTY": "Parte",
  "roles.COUNSEL": "Abogado",
  "roles.WITNESS": "Testigo",
  "roles.OTHER": "Otro",

  // --- JudgesPanel ---
  "judgesPanel.title": "Jueces y auxiliares",
  "judgesPanel.judges": "Jueces",
  "judgesPanel.auxiliaries": "Auxiliares",
  "judgesPanel.you": "usted",

  // --- HearingCard ---
  "hearingCard.number": "Audiencia #{number}",
  "hearingCard.presentCount": "({present}/{expected} presentes)",
  "hearingCard.active": "Activa · {elapsed}",
  "hearingCard.absent": "(ausente)",
  "hearingCard.remapNote": "Reasignado desde el público general → asignado como {name} (nueva parte)",
  "hearingCard.undoRemap": "Deshacer reasignación",
  "hearingCard.notesPlaceholder": "Agregar notas... (privado — solo usted las ve)",
  "hearingCard.markCompleted": "Marcar como completada",
  "hearingCard.setActive": "Establecer como activa",
  "hearingCard.reactivate": "Reactivar",
  "hearingCard.returnToPending": "Volver a pendiente",
  "hearingCard.mapToPlaceholder": "Mapear a…",
  "hearingCard.mapToConfirm": "Asignar",
  "hearingCard.addParty": "+ Agregar parte",
  "hearingCard.addPartySelectPerson": "Seleccionar persona…",
  "hearingCard.addPartySelectRole": "Seleccionar rol…",
  "hearingCard.addPartyConfirm": "Confirmar",
  "hearingCard.addPartyCancel": "Cancelar",

  // --- HearingsSection ---
  "hearingsSection.activeHearing": "⚖ Audiencia activa",
  "hearingsSection.completedTotal": "Audiencias completadas / total",
  "hearingsSection.pending": "Audiencias pendientes",
  "hearingsSection.ready": "Listas",
  "hearingsSection.incomplete": "Incompletas",
  "hearingsSection.noShow": "Inasistencia",
  "hearingsSection.completed": "Audiencias completadas",

  // --- GeneralPublic (presence + mic/camera grant only — mapping to a
  // hearing/party now lives on HearingCard, see hearingCard.mapTo* /
  // hearingCard.addParty* above) ---
  "generalPublic.title": "Público general",
  "generalPublic.micGranted": "🎙 Micrófono/cámara habilitados",
  "generalPublic.revoke": "Revocar",
  "generalPublic.grantMic": "Habilitar micrófono/cámara",
  "generalPublic.movedTo": "→ movido a Audiencia #{number}",
  "generalPublic.movedToUnknown": "→ movido a una audiencia",

  // --- App shell ---
  "app.connecting": "Conectando…",
  "app.errorNoMeeting":
    "No se pudo determinar a qué reunión de Teams corresponde esta pestaña. Ábrala desde una reunión de Teams en curso (o agregue ?meetingId=... para desarrollo local).",
  "app.errorRegisterMeeting": "No se pudo registrar esta reunión en el servidor: {message}",
  "app.staleBanner":
    "⚠ La conexión con la lista de participantes podría estar desactualizada — la presencia mostrada abajo puede no ser exacta.",
  "app.sessionEndedBanner": "✓ Sesión finalizada {time} — se enviaron los resúmenes a jueces y auxiliares.",
  "app.endSessionConfirm":
    "¿Finalizar la sesión y enviar a cada juez/auxiliar un resumen del estado final de cada audiencia, incluyendo sus propias notas? Esta acción no se puede deshacer.",
  "app.endSessionButton": "Finalizar sesión y enviar resúmenes",

  // --- backend error codes (api.ts's ApiError.code) rendered in Spanish
  // regardless of what the backend logged internally ---
  "errors.ALREADY_ACTIVE":
    "La audiencia #{hearingNumber} ya está activa — complétela o desactívela antes de activar otra.",
  "errors.GENERIC": "Ocurrió un error inesperado. Inténtelo de nuevo.",
} as const;
