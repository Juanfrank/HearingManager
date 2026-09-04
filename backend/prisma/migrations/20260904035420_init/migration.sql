BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [hearingmgr].[Meeting] (
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
CREATE TABLE [hearingmgr].[Hearing] (
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
CREATE TABLE [hearingmgr].[HearingNote] (
    [id] NVARCHAR(1000) NOT NULL,
    [hearingId] NVARCHAR(1000) NOT NULL,
    [authorEmail] NVARCHAR(1000) NOT NULL,
    [text] NVARCHAR(1000) NOT NULL CONSTRAINT [HearingNote_text_df] DEFAULT '',
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [HearingNote_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [HearingNote_hearingId_authorEmail_key] UNIQUE NONCLUSTERED ([hearingId],[authorEmail])
);

-- CreateTable
CREATE TABLE [hearingmgr].[PresenterGrant] (
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
CREATE TABLE [hearingmgr].[HearingPeriod] (
    [id] NVARCHAR(1000) NOT NULL,
    [hearingId] NVARCHAR(1000) NOT NULL,
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [HearingPeriod_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [endedAt] DATETIME2,
    CONSTRAINT [HearingPeriod_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [hearingmgr].[ExpectedParty] (
    [id] NVARCHAR(1000) NOT NULL,
    [hearingId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL CONSTRAINT [ExpectedParty_role_df] DEFAULT 'PARTY',
    [externalUid] NVARCHAR(1000),
    CONSTRAINT [ExpectedParty_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ExpectedParty_hearingId_externalUid_key] UNIQUE NONCLUSTERED ([hearingId],[externalUid])
);

-- CreateTable
CREATE TABLE [hearingmgr].[PartyEmail] (
    [id] NVARCHAR(1000) NOT NULL,
    [expectedPartyId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [PartyEmail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [hearingmgr].[RosterEntry] (
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
CREATE TABLE [hearingmgr].[RosterConnectionEvent] (
    [id] NVARCHAR(1000) NOT NULL,
    [meetingId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [displayName] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [occurredAt] DATETIME2 NOT NULL CONSTRAINT [RosterConnectionEvent_occurredAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RosterConnectionEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [hearingmgr].[RemapMapping] (
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
CREATE TABLE [hearingmgr].[JudgeOrAuxiliary] (
    [id] NVARCHAR(1000) NOT NULL,
    [meetingId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [externalUid] NVARCHAR(1000),
    CONSTRAINT [JudgeOrAuxiliary_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [JudgeOrAuxiliary_meetingId_externalUid_key] UNIQUE NONCLUSTERED ([meetingId],[externalUid])
);

-- CreateTable
CREATE TABLE [hearingmgr].[JudgeEmail] (
    [id] NVARCHAR(1000) NOT NULL,
    [judgeOrAuxiliaryId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [JudgeEmail_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [hearingmgr].[AuditLogEntry] (
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
CREATE NONCLUSTERED INDEX [Hearing_meetingId_idx] ON [hearingmgr].[Hearing]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HearingNote_hearingId_idx] ON [hearingmgr].[HearingNote]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PresenterGrant_meetingId_idx] ON [hearingmgr].[PresenterGrant]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HearingPeriod_hearingId_idx] ON [hearingmgr].[HearingPeriod]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExpectedParty_hearingId_idx] ON [hearingmgr].[ExpectedParty]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PartyEmail_expectedPartyId_idx] ON [hearingmgr].[PartyEmail]([expectedPartyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PartyEmail_email_idx] ON [hearingmgr].[PartyEmail]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RosterEntry_meetingId_idx] ON [hearingmgr].[RosterEntry]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RosterConnectionEvent_meetingId_idx] ON [hearingmgr].[RosterConnectionEvent]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RosterConnectionEvent_meetingId_email_idx] ON [hearingmgr].[RosterConnectionEvent]([meetingId], [email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RemapMapping_hearingId_idx] ON [hearingmgr].[RemapMapping]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RemapMapping_rosterEmail_idx] ON [hearingmgr].[RemapMapping]([rosterEmail]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JudgeOrAuxiliary_meetingId_idx] ON [hearingmgr].[JudgeOrAuxiliary]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JudgeEmail_judgeOrAuxiliaryId_idx] ON [hearingmgr].[JudgeEmail]([judgeOrAuxiliaryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [JudgeEmail_email_idx] ON [hearingmgr].[JudgeEmail]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLogEntry_meetingId_idx] ON [hearingmgr].[AuditLogEntry]([meetingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLogEntry_hearingId_idx] ON [hearingmgr].[AuditLogEntry]([hearingId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLogEntry_createdAt_idx] ON [hearingmgr].[AuditLogEntry]([createdAt]);

-- AddForeignKey
ALTER TABLE [hearingmgr].[Hearing] ADD CONSTRAINT [Hearing_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [hearingmgr].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [hearingmgr].[HearingNote] ADD CONSTRAINT [HearingNote_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [hearingmgr].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [hearingmgr].[PresenterGrant] ADD CONSTRAINT [PresenterGrant_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [hearingmgr].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [hearingmgr].[HearingPeriod] ADD CONSTRAINT [HearingPeriod_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [hearingmgr].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [hearingmgr].[ExpectedParty] ADD CONSTRAINT [ExpectedParty_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [hearingmgr].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [hearingmgr].[PartyEmail] ADD CONSTRAINT [PartyEmail_expectedPartyId_fkey] FOREIGN KEY ([expectedPartyId]) REFERENCES [hearingmgr].[ExpectedParty]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [hearingmgr].[RosterEntry] ADD CONSTRAINT [RosterEntry_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [hearingmgr].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [hearingmgr].[RosterConnectionEvent] ADD CONSTRAINT [RosterConnectionEvent_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [hearingmgr].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [hearingmgr].[RemapMapping] ADD CONSTRAINT [RemapMapping_mappedToExpectedPartyId_fkey] FOREIGN KEY ([mappedToExpectedPartyId]) REFERENCES [hearingmgr].[ExpectedParty]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [hearingmgr].[RemapMapping] ADD CONSTRAINT [RemapMapping_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [hearingmgr].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [hearingmgr].[JudgeOrAuxiliary] ADD CONSTRAINT [JudgeOrAuxiliary_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [hearingmgr].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [hearingmgr].[JudgeEmail] ADD CONSTRAINT [JudgeEmail_judgeOrAuxiliaryId_fkey] FOREIGN KEY ([judgeOrAuxiliaryId]) REFERENCES [hearingmgr].[JudgeOrAuxiliary]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [hearingmgr].[AuditLogEntry] ADD CONSTRAINT [AuditLogEntry_meetingId_fkey] FOREIGN KEY ([meetingId]) REFERENCES [hearingmgr].[Meeting]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [hearingmgr].[AuditLogEntry] ADD CONSTRAINT [AuditLogEntry_hearingId_fkey] FOREIGN KEY ([hearingId]) REFERENCES [hearingmgr].[Hearing]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
