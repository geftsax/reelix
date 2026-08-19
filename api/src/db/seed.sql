MERGE rx.AgeRating AS target
USING (VALUES
    (N'U',   N'Universal - suitable for all',        0,  1),
    (N'PG',  N'Parental Guidance',                   8,  2),
    (N'12',  N'Suitable for 12 years and over',     12,  3),
    (N'15',  N'Suitable for 15 years and over',     15,  4),
    (N'18',  N'Adults only',                        18,  5)
) AS source (AgeRatingCode, RatingLabel, MinimumAge, DisplayOrder)
    ON target.AgeRatingCode = source.AgeRatingCode
WHEN NOT MATCHED THEN
    INSERT (AgeRatingCode, RatingLabel, MinimumAge, DisplayOrder)
    VALUES (source.AgeRatingCode, source.RatingLabel, source.MinimumAge, source.DisplayOrder);
GO

MERGE rx.Genre AS target
USING (VALUES
    (N'music',      N'Music'),
    (N'comedy',     N'Comedy'),
    (N'education',  N'Education'),
    (N'sport',      N'Sport'),
    (N'technology', N'Technology'),
    (N'travel',     N'Travel'),
    (N'food',       N'Food'),
    (N'gaming',     N'Gaming'),
    (N'news',       N'News & Current Affairs'),
    (N'lifestyle',  N'Lifestyle')
) AS source (GenreCode, GenreName)
    ON target.GenreCode = source.GenreCode
WHEN NOT MATCHED THEN
    INSERT (GenreCode, GenreName) VALUES (source.GenreCode, source.GenreName);
GO
