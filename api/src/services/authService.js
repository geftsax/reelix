import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { repository } from '../repositories/index.js';
import { badRequest, conflict, unauthorised, unprocessable } from '../utils/httpError.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['consumer', 'creator', 'admin'];

const currentYear = () => new Date().getUTCFullYear();

export const validateRegistration = (payload) => {
  const errors = {};
  const emailAddress = String(payload.emailAddress ?? '').trim().toLowerCase();
  const displayName = String(payload.displayName ?? '').trim();
  const password = String(payload.password ?? '');
  const birthYearRaw = payload.birthYear;

  if (!EMAIL_PATTERN.test(emailAddress)) errors.emailAddress = 'A valid email address is required.';
  if (displayName.length < 2 || displayName.length > 80) {
    errors.displayName = 'Display name must be between 2 and 80 characters.';
  }
  if (password.length < config.auth.minPasswordLength) {
    errors.password = `Password must be at least ${config.auth.minPasswordLength} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = 'Password must contain at least one letter and one digit.';
  }

  let birthYear = null;
  if (birthYearRaw !== undefined && birthYearRaw !== null && birthYearRaw !== '') {
    birthYear = Number.parseInt(birthYearRaw, 10);
    const year = currentYear();
    if (!Number.isFinite(birthYear) || birthYear < year - 120 || birthYear > year) {
      errors.birthYear = 'Birth year is not valid.';
    }
  }

  if (Object.keys(errors).length) {
    throw unprocessable('The details supplied could not be accepted.', errors);
  }

  return { emailAddress, displayName, password, birthYear };
};

export const signToken = (account) =>
  jwt.sign(
    {
      sub: String(account.accountId),
      email: account.emailAddress,
      name: account.displayName,
      role: account.role,
      channel: account.channelName ?? undefined,
      birthYear: account.birthYear ?? undefined,
    },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtTtlSeconds, issuer: 'reelix-api' },
  );

export const verifyToken = (token) =>
  jwt.verify(token, config.auth.jwtSecret, { issuer: 'reelix-api' });

export const registerConsumer = async (payload) => {
  const details = validateRegistration(payload);

  const existing = await repository.accounts.findByEmail(details.emailAddress);
  if (existing) throw conflict('An account already exists for that email address.');

  const passwordHash = await bcrypt.hash(details.password, config.auth.bcryptRounds);

  const account = await repository.accounts.create({
    emailAddress: details.emailAddress,
    displayName: details.displayName,
    passwordHash,
    role: 'consumer',
    channelName: null,
    birthYear: details.birthYear,
  });

  return { account, token: signToken(account) };
};

export const authenticate = async ({ emailAddress, password }) => {
  const email = String(emailAddress ?? '').trim().toLowerCase();
  if (!email || !password) throw badRequest('Email address and password are required.');

  const record = await repository.accounts.findByEmail(email);

  const hash = record?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
  const matches = await bcrypt.compare(String(password), hash);

  if (!record || !matches) throw unauthorised('Email address or password is incorrect.');
  if (!record.isActive) throw unauthorised('This account has been deactivated.');

  await repository.accounts.touchLogin(record.accountId);

  const account = {
    accountId: record.accountId,
    emailAddress: record.emailAddress,
    displayName: record.displayName,
    role: record.role,
    channelName: record.channelName,
    birthYear: record.birthYear,
    isActive: record.isActive,
    createdUtc: record.createdUtc,
  };

  return { account, token: signToken(account) };
};

export const createAccountWithRole = async (payload, role) => {
  if (!ROLES.includes(role)) throw badRequest(`Unknown role '${role}'.`);

  const details = validateRegistration(payload);
  const existing = await repository.accounts.findByEmail(details.emailAddress);
  if (existing) throw conflict('An account already exists for that email address.');

  const passwordHash = await bcrypt.hash(details.password, config.auth.bcryptRounds);

  return repository.accounts.create({
    emailAddress: details.emailAddress,
    displayName: details.displayName,
    passwordHash,
    role,
    channelName: payload.channelName ? String(payload.channelName).trim() : null,
    birthYear: details.birthYear,
  });
};

export const maxMinimumAgeFor = (principal) => {
  if (principal?.role === 'admin') return null;
  if (!principal?.birthYear) return config.auth.unverifiedMaxMinimumAge;
  return Math.max(0, currentYear() - Number(principal.birthYear));
};
