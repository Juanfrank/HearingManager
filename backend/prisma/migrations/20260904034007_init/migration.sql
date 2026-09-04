BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Meeting] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizerUserId] NVARCHAR(1000),
    [onlineMeetingId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Meeting_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [endedAt] DATETIME2,
    [endedBy] NVARCHAR(1000),
    CONSTRAINT [Meeting_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Hearing] (
    [id] NVARCHAR(1000) NOT NULL,
    [meetingId] NVARCHAR(1000) NOT NULL,
    [hearingNumber] INT NOT NULL,
    [state] NVARCHAR(1000) NOT NULL CONSTRAINT [Hearing_state_df] DEFAULT 'PENDING',
    [scheduledAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Hearing_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Hearing_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Hearing_meetingId_hearingNumber_key] UNIQUE NONCLUSTERED ([meetingId],[hearingNumber])
);

-- CreateTable
CREATE TABLE [dbo].[HearingNote] (
    [id] NVARCHAR(1000) NOT NULL,
    [hearingId] NVARCHAR(1000) NOT NULL,
    [authorEmail] NVARCHAR(1000) NOT NULL,
    [text] NVARCHAR(1000) NOT NULL CONSTRAINT [HearingNote_text_df] DEFAULT '',
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [HearingNote_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [HearingNote_hearingId_authorEmail_key] UNIQUE NONCLUSTERED ([hearingId],[authorEmail])
);

-- CreateTable
CREATE TABLE [dbo].[PresenterGrant] (
    [id] NVARCHAR(1000) NOT NULL,
    [meetingId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [grantedBy] NVARCHAR(1000) NOT NULL,
    [grantedAt] DATETIME2 NOT NULL CONSTRAINT [PresenterGrant_grantedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [revokedAt] DATETIME2,
    [revokedBy] NVARCHAR(1000),
    CONSTRAINT [PresenterGrant_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[HearingPeriod] (
    [id] NVARCHAR(1000) NOT NULL,
    [hearingId] NVARCHAR(1000) NOT NULL,
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [HearingPeriod_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [endedAt] DATETIME2,
    CONSTRAINT [HearingPeriod_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ExpectedParty] (
    [id] NVARCHAR(1000) NOT NULL,
    [hearingId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL CONSTRAINT [ExpectedParty_role_df] DEFAULT 'PARTY',
    [externalUid] NVARCHAR(1000),
    CONSTRAINT [ExpectedParty_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ExpectedParty_hearingId_externalUid_key] UNIQUE NONCLUSTERED ([hearingId],[externalUid])
);

-- CreateTable
CREATE TABLE [dbo].[PartyEmail] (
    [id] NVARCHAR(1000) NOT NULL,
    [expectedPartyId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [PartyEmail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RosterEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [meetingId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [displayName] NVARCHAR(1000) NOT NULL,
    [joinedAt] DATETIME2 NOT NULL CONSTRAINT [RosterEntry_joinedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [leftAt] DATETIME2,
    [isConnected] BIT NOT NULL CONSTRAINT [RosterEntry_isConnected_df] DEFAULT 1,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RosterEntry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RosterEntry_meetingId_email_key] UNIQUE NONCLUSTERED ([meetingId],[email])
);

-- CreateTable
CREATE TABLE [dbo].[RosterConnectionEvent] (
    [id] NVARCHAR(1000) NOT NULL,
    [meetingId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [displayName] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [occurredAt] DATETIME2 NOT NULL CONSTRAINT [RosterConnectionEvent_occurredAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RosterConnectionEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RemapMapping] (
    [id] NVARCHAR(1000) NOT NULL,
    [rosterEmail] NVARCHAR(1000) NOT NULL,
    [mappedToType] NVARCHAR(1000) NOT NULL,
    [mappedToExpectedPartyId] NVARCHAR(1000),
    [newPartyName] NVARCHAR(1000),
    [hearingId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RemapMapping_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [undoneAt] DATETIME2,
    CONSTRAINT [RemapMapping_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[JudgeOrAuxiliary] (
    [id] NVARCHAR(1000) NOT NULL,
    [meetingId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [externalUid] NVARCHAR(1000),
    CONSTRAINT [JudgeOrAuxiliary_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [JudgeOrAuxiliary_meetingId_externalUid_key] UNIQUE NONCLUSTERED ([meetingId],[externalUid])
);

-- CreateTable
CREATE TABLE [dbo].[JudgeEmail] (
    [id] NVARCHAR(1000) NOT NULL,
    [judgeOrAuxiliaryId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [JudgeEmail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLogEntry] (
    [id] NVARCHAR(1000) NOT NULL,
    [meetingId] NVARCHAR(1000),
    [hearingId] NVARCHAR(1000),
    [actorEmail] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [before] NVARCHAR(max),
    [after] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLogEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLogEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Hearing_meetingId_idx] ON [dbo].[Hearing]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HearingNote_hearingId_idx] ON [dbo].[HearingNote]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PresenterGrant_meetingId_idx] ON [dbo].[PresenterGrant]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HearingPeriod_hearingId_idx] ON [dbo].[HearingPeriod]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExpectedParty_hearingId_idx] ON [dbo].[ExpectedParty]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PartyEmail_expectedPartyId_idx] ON [dbo].[PartyEmail]([expectedPartyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PartyEmail_email_idx] ON [dbo].[PartyEmail]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RosterEntry_meetingId_idx] ON [dbo].[RosterEntry]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RosterConnectionEvent_meetingId_idx] ON [dbo].[RosterConnectionEvent]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RosterConnectionEvent_meetingId_email_idx] ON [dbo].[RosterConnectionEvent]([meetingId], [email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RemapMapping_hearingId_idx] ON [dbo].[RemapMapping]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RemapMapping_rosterEmail_idx] ON [dbo].[RemapMapping]([rosterEmail]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JudgeOrAuxiliary_meetingId_idx] ON [dbo].[JudgeOrAuxiliary]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JudgeEmail_judgeOrAuxiliaryId_idx] ON [dbo].[JudgeEmail]([judgeOrAuxiliaryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JudgeEmail_email_idx] ON [dbo].[JudgeEmail]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLogEntry_meetingId_idx] ON [dbo].[AuditLogEntry]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLogEntry_hearingId_idx] ON [dbo].[AuditLogEntry]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLogEntry_createdAt_idx] ON [dbo].[AuditLogEntry]([createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Hearing] ADD CONSTRAINT [Hearing_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[HearingNote] ADD CONSTRAINT [HearingNote_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [dbo].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PresenterGrant] ADD CONSTRAINT [PresenterGrant_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[HearingPeriod] ADD CONSTRAINT [HearingPeriod_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [dbo].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExpectedParty] ADD CONSTRAINT [ExpectedParty_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [dbo].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PartyEmail] ADD CONSTRAINT [PartyEmail_expectedPartyId_fkey] FOREIGN KEY ([expectedPartyId]) REFERENCES [dbo].[ExpectedParty]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RosterEntry] ADD CONSTRAINT [RosterEntry_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RosterConnectionEvent] ADD CONSTRAINT [RosterConnectionEvent_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RemapMapping] ADD CONSTRAINT [RemapMapping_mappedToExpectedPartyId_fkey] FOREIGN KEY ([mappedToExpectedPartyId]) REFERENCES [dbo].[ExpectedParty]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RemapMapping] ADD CONSTRAINT [RemapMapping_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [dbo].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[JudgeOrAuxiliary] ADD CONSTRAINT [JudgeOrAuxiliary_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[JudgeEmail] ADD CONSTRAINT [JudgeEmail_judgeOrAuxiliaryId_fkey] FOREIGN KEY ([judgeOrAuxiliaryId]) REFERENCES [dbo].[JudgeOrAuxiliary]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLogEntry] ADD CONSTRAINT [AuditLogEntry_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [dbo].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLogEntry] ADD CONSTRAINT [AuditLogEntry_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [dbo].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
