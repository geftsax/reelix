IF SCHEMA_ID('rx') IS NULL
    EXEC('CREATE SCHEMA rx');
GO

-- Lookup tables
IF OBJECT_ID('rx.AgeRating', 'U') IS NULL
BEGIN
    CREATE TABLE rx.AgeRating (
        AgeRatingCode   NVARCHAR(8)   NOT NULL CONSTRAINT PK_AgeRating PRIMARY KEY,
        RatingLabel     NVARCHAR(64)  NOT NULL,
        MinimumAge      INT           NOT NULL,
        DisplayOrder    INT           NOT NULL
    );
END
GO

IF OBJECT_ID('rx.Genre', 'U') IS NULL
BEGIN
    CREATE TABLE rx.Genre (
        GenreCode       NVARCHAR(24)  NOT NULL CONSTRAINT PK_Genre PRIMARY KEY,
        GenreName       NVARCHAR(64)  NOT NULL,
        IsActive        BIT           NOT NULL CONSTRAINT DF_Genre_IsActive DEFAULT (1)
    );
END
GO


-- Accounts and clips
IF OBJECT_ID('rx.Account', 'U') IS NULL
BEGIN
    CREATE TABLE rx.Account (
        AccountId       INT            IDENTITY(1,1) CONSTRAINT PK_Account PRIMARY KEY,
        EmailAddress    NVARCHAR(256)  NOT NULL,
        DisplayName     NVARCHAR(80)   NOT NULL,
        PasswordHash    NVARCHAR(256)  NOT NULL,
        AccountRole     NVARCHAR(16)   NOT NULL,
        ChannelName     NVARCHAR(120)  NULL,
        BirthYear       INT            NULL,
        IsActive        BIT            NOT NULL CONSTRAINT DF_Account_IsActive DEFAULT (1),
        CreatedUtc      DATETIME2(0)   NOT NULL CONSTRAINT DF_Account_Created DEFAULT (SYSUTCDATETIME()),
        LastLoginUtc    DATETIME2(0)   NULL,
        CONSTRAINT UQ_Account_Email UNIQUE (EmailAddress),
        CONSTRAINT CK_Account_Role  CHECK (AccountRole IN ('consumer', 'creator', 'admin'))
    );
END
GO

IF OBJECT_ID('rx.Clip', 'U') IS NULL
BEGIN
    CREATE TABLE rx.Clip (
        ClipId          INT            IDENTITY(1,1) CONSTRAINT PK_Clip PRIMARY KEY,
        OwnerAccountId  INT            NOT NULL,
        ClipTitle       NVARCHAR(160)  NOT NULL,
        Synopsis        NVARCHAR(1000) NULL,
        Publisher       NVARCHAR(120)  NOT NULL,
        Producer        NVARCHAR(120)  NOT NULL,
        GenreCode       NVARCHAR(24)   NOT NULL,
        AgeRatingCode   NVARCHAR(8)    NOT NULL,
        BlobName        NVARCHAR(260)  NOT NULL,
        ContentType     NVARCHAR(100)  NOT NULL,
        SizeBytes       BIGINT         NOT NULL,
        DurationSeconds INT            NULL,
        ViewCount       INT            NOT NULL CONSTRAINT DF_Clip_ViewCount DEFAULT (0),
        PosterSeed      INT            NOT NULL CONSTRAINT DF_Clip_PosterSeed DEFAULT (0),
        PublishState    NVARCHAR(16)   NOT NULL CONSTRAINT DF_Clip_State DEFAULT ('published'),
        PublishedUtc    DATETIME2(0)   NOT NULL CONSTRAINT DF_Clip_Published DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_Clip_Account   FOREIGN KEY (OwnerAccountId) REFERENCES rx.Account(AccountId),
        CONSTRAINT FK_Clip_Genre     FOREIGN KEY (GenreCode)      REFERENCES rx.Genre(GenreCode),
        CONSTRAINT FK_Clip_AgeRating FOREIGN KEY (AgeRatingCode)  REFERENCES rx.AgeRating(AgeRatingCode),
        CONSTRAINT CK_Clip_State     CHECK (PublishState IN ('published', 'hidden')),
        CONSTRAINT CK_Clip_Size      CHECK (SizeBytes > 0)
    );
END
GO

-- Indexes for the discover and studio queries
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Clip_Recent' AND object_id = OBJECT_ID('rx.Clip'))
    CREATE INDEX IX_Clip_Recent ON rx.Clip (PublishState, PublishedUtc DESC) INCLUDE (ClipTitle, GenreCode, AgeRatingCode);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Clip_Genre' AND object_id = OBJECT_ID('rx.Clip'))
    CREATE INDEX IX_Clip_Genre ON rx.Clip (GenreCode, PublishedUtc DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Clip_Owner' AND object_id = OBJECT_ID('rx.Clip'))
    CREATE INDEX IX_Clip_Owner ON rx.Clip (OwnerAccountId, PublishedUtc DESC);
GO


-- Engagement
IF OBJECT_ID('rx.ClipComment', 'U') IS NULL
BEGIN
    CREATE TABLE rx.ClipComment (
        CommentId         INT            IDENTITY(1,1) CONSTRAINT PK_ClipComment PRIMARY KEY,
        ClipId            INT            NOT NULL,
        AccountId         INT            NOT NULL,
        CommentBody       NVARCHAR(1000) NOT NULL,
        ModerationVerdict NVARCHAR(16)   NOT NULL CONSTRAINT DF_Comment_Verdict DEFAULT ('allowed'),
        ModerationSeverity INT           NOT NULL CONSTRAINT DF_Comment_Severity DEFAULT (0),
        ModerationCategory NVARCHAR(32)  NULL,
        IsVisible         BIT            NOT NULL CONSTRAINT DF_Comment_Visible DEFAULT (1),
        PostedUtc         DATETIME2(0)   NOT NULL CONSTRAINT DF_Comment_Posted DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_Comment_Clip    FOREIGN KEY (ClipId)    REFERENCES rx.Clip(ClipId) ON DELETE CASCADE,
        CONSTRAINT FK_Comment_Account FOREIGN KEY (AccountId) REFERENCES rx.Account(AccountId),
        CONSTRAINT CK_Comment_Verdict CHECK (ModerationVerdict IN ('allowed', 'flagged', 'blocked', 'skipped'))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Comment_Clip' AND object_id = OBJECT_ID('rx.ClipComment'))
    CREATE INDEX IX_Comment_Clip ON rx.ClipComment (ClipId, PostedUtc DESC);
GO

IF OBJECT_ID('rx.ClipRating', 'U') IS NULL
BEGIN
    CREATE TABLE rx.ClipRating (
        ClipId      INT          NOT NULL,
        AccountId   INT          NOT NULL,
        RatingScore TINYINT      NOT NULL,
        RatedUtc    DATETIME2(0) NOT NULL CONSTRAINT DF_Rating_Rated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_ClipRating     PRIMARY KEY (ClipId, AccountId),
        CONSTRAINT FK_Rating_Clip    FOREIGN KEY (ClipId)    REFERENCES rx.Clip(ClipId) ON DELETE CASCADE,
        CONSTRAINT FK_Rating_Account FOREIGN KEY (AccountId) REFERENCES rx.Account(AccountId),
        CONSTRAINT CK_Rating_Score   CHECK (RatingScore BETWEEN 1 AND 5)
    );
END
GO

IF OBJECT_ID('rx.ViewEvent', 'U') IS NULL
BEGIN
    CREATE TABLE rx.ViewEvent (
        ViewEventId BIGINT       IDENTITY(1,1) CONSTRAINT PK_ViewEvent PRIMARY KEY,
        ClipId      INT          NOT NULL,
        AccountId   INT          NULL,
        ViewedUtc   DATETIME2(0) NOT NULL CONSTRAINT DF_View_Viewed DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_View_Clip    FOREIGN KEY (ClipId)    REFERENCES rx.Clip(ClipId) ON DELETE CASCADE,
        CONSTRAINT FK_View_Account FOREIGN KEY (AccountId) REFERENCES rx.Account(AccountId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_View_Clip' AND object_id = OBJECT_ID('rx.ViewEvent'))
    CREATE INDEX IX_View_Clip ON rx.ViewEvent (ViewedUtc DESC, ClipId);
GO

CREATE OR ALTER VIEW rx.vwClipSummary
AS
SELECT
    c.ClipId,
    c.ClipTitle,
    c.Synopsis,
    c.Publisher,
    c.Producer,
    c.GenreCode,
    g.GenreName,
    c.AgeRatingCode,
    ar.RatingLabel        AS AgeRatingLabel,
    ar.MinimumAge,
    c.BlobName,
    c.ContentType,
    c.SizeBytes,
    c.DurationSeconds,
    c.ViewCount,
    c.PosterSeed,
    c.PublishState,
    c.PublishedUtc,
    acc.AccountId         AS OwnerAccountId,
    acc.DisplayName       AS OwnerDisplayName,
    acc.ChannelName       AS OwnerChannelName,
    ISNULL(rt.RatingCount, 0)   AS RatingCount,
    ISNULL(rt.AverageRating, 0) AS AverageRating,
    ISNULL(cm.CommentCount, 0)  AS CommentCount
FROM rx.Clip AS c
INNER JOIN rx.Genre     AS g   ON g.GenreCode     = c.GenreCode
INNER JOIN rx.AgeRating AS ar  ON ar.AgeRatingCode = c.AgeRatingCode
INNER JOIN rx.Account   AS acc ON acc.AccountId   = c.OwnerAccountId
OUTER APPLY (
    SELECT COUNT_BIG(*) AS RatingCount,
           CAST(AVG(CAST(r.RatingScore AS DECIMAL(4, 2))) AS DECIMAL(4, 2)) AS AverageRating
    FROM rx.ClipRating AS r
    WHERE r.ClipId = c.ClipId
) AS rt
OUTER APPLY (
    SELECT COUNT_BIG(*) AS CommentCount
    FROM rx.ClipComment AS cc
    WHERE cc.ClipId = c.ClipId AND cc.IsVisible = 1
) AS cm;
GO

CREATE OR ALTER PROCEDURE rx.uspSearchClips
    @SearchTerm    NVARCHAR(160) = NULL,
    @GenreCode     NVARCHAR(24)  = NULL,
    @AgeRatingCode NVARCHAR(8)   = NULL,
    @MaxMinimumAge INT           = NULL,
    @SortBy        NVARCHAR(16)  = 'recent',
    @PageNumber    INT           = 1,
    @PageSize      INT           = 12
AS
BEGIN
    SET NOCOUNT ON;

    IF @PageNumber < 1 SET @PageNumber = 1;
    IF @PageSize  < 1 SET @PageSize  = 12;
    IF @PageSize  > 48 SET @PageSize = 48;

    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    DECLARE @Term NVARCHAR(320) = CASE
        WHEN @SearchTerm IS NULL OR LTRIM(RTRIM(@SearchTerm)) = '' THEN NULL
        ELSE '%' + LTRIM(RTRIM(@SearchTerm)) + '%'
    END;

    ;WITH Filtered AS (
        SELECT v.*
        FROM rx.vwClipSummary AS v
        WHERE v.PublishState = 'published'
          AND (@GenreCode     IS NULL OR v.GenreCode     = @GenreCode)
          AND (@AgeRatingCode IS NULL OR v.AgeRatingCode = @AgeRatingCode)
          AND (@MaxMinimumAge IS NULL OR v.MinimumAge   <= @MaxMinimumAge)
          AND (@Term IS NULL
               OR v.ClipTitle        LIKE @Term
               OR v.Synopsis         LIKE @Term
               OR v.Publisher        LIKE @Term
               OR v.Producer         LIKE @Term
               OR v.GenreName        LIKE @Term
               OR v.OwnerDisplayName LIKE @Term)
    )
    SELECT
        f.*,
        COUNT(*) OVER () AS TotalMatches
    FROM Filtered AS f
    ORDER BY
        CASE WHEN @SortBy = 'popular' THEN f.ViewCount     END DESC,
        CASE WHEN @SortBy = 'rated'   THEN f.AverageRating END DESC,
        f.PublishedUtc DESC,
        f.ClipId DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE rx.uspRegisterView
    @ClipId    INT,
    @AccountId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;

    UPDATE rx.Clip
    SET ViewCount = ViewCount + 1
    WHERE ClipId = @ClipId;

    INSERT INTO rx.ViewEvent (ClipId, AccountId)
    VALUES (@ClipId, @AccountId);

    COMMIT TRANSACTION;

    SELECT ViewCount FROM rx.Clip WHERE ClipId = @ClipId;
END;
GO

CREATE OR ALTER PROCEDURE rx.uspUpsertRating
    @ClipId      INT,
    @AccountId   INT,
    @RatingScore TINYINT
AS
BEGIN
    SET NOCOUNT ON;

    MERGE rx.ClipRating AS target
    USING (SELECT @ClipId AS ClipId, @AccountId AS AccountId) AS source
        ON target.ClipId = source.ClipId AND target.AccountId = source.AccountId
    WHEN MATCHED THEN
        UPDATE SET RatingScore = @RatingScore, RatedUtc = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (ClipId, AccountId, RatingScore) VALUES (@ClipId, @AccountId, @RatingScore);

    SELECT
        COUNT_BIG(*) AS RatingCount,
        CAST(AVG(CAST(RatingScore AS DECIMAL(4, 2))) AS DECIMAL(4, 2)) AS AverageRating
    FROM rx.ClipRating
    WHERE ClipId = @ClipId;
END;
GO

CREATE OR ALTER PROCEDURE rx.uspDashboard
    @MaxMinimumAge INT = NULL,
    @LatestCount   INT = 12,
    @TrendingCount INT = 6
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@LatestCount) v.*
    FROM rx.vwClipSummary AS v
    WHERE v.PublishState = 'published'
      AND (@MaxMinimumAge IS NULL OR v.MinimumAge <= @MaxMinimumAge)
    ORDER BY v.PublishedUtc DESC, v.ClipId DESC;

    SELECT TOP (@TrendingCount) v.*, ISNULL(w.RecentViews, 0) AS RecentViews
    FROM rx.vwClipSummary AS v
    OUTER APPLY (
        SELECT COUNT_BIG(*) AS RecentViews
        FROM rx.ViewEvent AS ve
        WHERE ve.ClipId = v.ClipId
          AND ve.ViewedUtc >= DATEADD(DAY, -7, SYSUTCDATETIME())
    ) AS w
    WHERE v.PublishState = 'published'
      AND (@MaxMinimumAge IS NULL OR v.MinimumAge <= @MaxMinimumAge)
    ORDER BY RecentViews DESC, v.ViewCount DESC, v.PublishedUtc DESC;
END;
GO
