export const toAccountDto = (row) => {
  if (!row) return null;
  return {
    accountId: Number(row.AccountId),
    emailAddress: row.EmailAddress,
    displayName: row.DisplayName,
    role: row.AccountRole,
    channelName: row.ChannelName ?? null,
    birthYear: row.BirthYear ?? null,
    isActive: Boolean(row.IsActive),
    createdUtc: row.CreatedUtc,
    lastLoginUtc: row.LastLoginUtc ?? null,
  };
};

export const toAccountWithSecret = (row) => {
  if (!row) return null;
  return { ...toAccountDto(row), passwordHash: row.PasswordHash };
};

export const toClipDto = (row) => {
  if (!row) return null;
  return {
    clipId: Number(row.ClipId),
    title: row.ClipTitle,
    synopsis: row.Synopsis ?? null,
    publisher: row.Publisher,
    producer: row.Producer,
    genreCode: row.GenreCode,
    genreName: row.GenreName,
    ageRatingCode: row.AgeRatingCode,
    ageRatingLabel: row.AgeRatingLabel,
    minimumAge: Number(row.MinimumAge),
    blobName: row.BlobName,
    contentType: row.ContentType,
    sizeBytes: Number(row.SizeBytes),
    durationSeconds: row.DurationSeconds ?? null,
    viewCount: Number(row.ViewCount),
    posterSeed: Number(row.PosterSeed),
    publishState: row.PublishState,
    publishedUtc: row.PublishedUtc,
    owner: {
      accountId: Number(row.OwnerAccountId),
      displayName: row.OwnerDisplayName,
      channelName: row.OwnerChannelName ?? null,
    },
    ratingCount: Number(row.RatingCount ?? 0),
    averageRating: Number(row.AverageRating ?? 0),
    commentCount: Number(row.CommentCount ?? 0),
    recentViews: row.RecentViews === undefined ? undefined : Number(row.RecentViews),
  };
};

export const toCommentDto = (row) => {
  if (!row) return null;
  return {
    commentId: Number(row.CommentId),
    clipId: Number(row.ClipId),
    body: row.CommentBody,
    moderationVerdict: row.ModerationVerdict,
    moderationSeverity: Number(row.ModerationSeverity ?? 0),
    moderationCategory: row.ModerationCategory ?? null,
    isVisible: Boolean(row.IsVisible),
    postedUtc: row.PostedUtc,
    author: {
      accountId: Number(row.AccountId),
      displayName: row.AuthorDisplayName ?? row.DisplayName ?? 'Unknown',
    },
  };
};

export const toGenreDto = (row) => ({
  genreCode: row.GenreCode,
  genreName: row.GenreName,
});

export const toAgeRatingDto = (row) => ({
  ageRatingCode: row.AgeRatingCode,
  ratingLabel: row.RatingLabel,
  minimumAge: Number(row.MinimumAge),
  displayOrder: Number(row.DisplayOrder),
});
