import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../utils/httpError.js';
import { recordDatabaseFailure } from '../services/metrics.js';

const SQL_UNIQUE_VIOLATIONS = [2627, 2601];
const SQL_FK_VIOLATION = 547;

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: `No route matches ${req.method} ${req.originalUrl}.`,
  });
};

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export const errorHandler = (error, req, res, next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: error.status === 422 ? 'ValidationFailed' : 'RequestFailed',
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      error: 'UploadRejected',
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? `The file exceeds the ${config.upload.maxMegabytes} MB upload limit.`
          : `Upload rejected: ${error.message}.`,
    });
  }

  if (SQL_UNIQUE_VIOLATIONS.includes(error?.number)) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'That record already exists.',
    });
  }

  if (error?.number === SQL_FK_VIOLATION) {
    return res.status(422).json({
      error: 'ValidationFailed',
      message: 'A referenced record (genre, age rating or account) does not exist.',
    });
  }

  if (error?.code && String(error.code).startsWith('E')) recordDatabaseFailure();

  console.error('[reelix] unhandled error', {
    path: req.originalUrl,
    method: req.method,
    message: error?.message,
    stack: config.env === 'production' ? undefined : error?.stack,
  });

  return res.status(500).json({
    error: 'ServerError',
    message: 'The request could not be completed. Please try again.',
  });
};
