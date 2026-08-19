import { verifyToken } from '../services/authService.js';
import { forbidden, unauthorised } from '../utils/httpError.js';

const readBearer = (req) => {
  const header = req.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
};

export const attachPrincipal = (req, _res, next) => {
  const token = readBearer(req);
  if (!token) return next();

  try {
    const claims = verifyToken(token);
    req.principal = {
      accountId: Number(claims.sub),
      emailAddress: claims.email,
      displayName: claims.name,
      role: claims.role,
      channelName: claims.channel ?? null,
      birthYear: claims.birthYear ?? null,
    };
  } catch {
    req.principal = null;
  }

  return next();
};

export const requireAuth = (req, _res, next) => {
  if (!req.principal) return next(unauthorised('Sign in to continue.'));
  return next();
};

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.principal) return next(unauthorised('Sign in to continue.'));
    if (!roles.includes(req.principal.role)) {
      return next(
        forbidden(
          `This action is restricted to ${roles.join(' or ')} accounts. Your account is a ${req.principal.role} account.`,
        ),
      );
    }
    return next();
  };
