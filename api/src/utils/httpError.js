export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details) this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorised = (message = 'Authentication required.') => new HttpError(401, message);
export const forbidden = (message = 'You do not have permission to do that.') =>
  new HttpError(403, message);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message) => new HttpError(409, message);
export const payloadTooLarge = (message) => new HttpError(413, message);
export const unprocessable = (message, details) => new HttpError(422, message, details);
