import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config, usingAzureStorage } from './config.js';
import { attachPrincipal } from './middleware/auth.js';
import { requestLog } from './middleware/requestLog.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import clipRoutes from './routes/clips.js';
import catalogueRoutes from './routes/catalogue.js';
import adminRoutes from './routes/admin.js';
import systemRoutes from './routes/system.js';
import mediaRoutes from './routes/media.js';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const allowAllOrigins = config.cors.origins.includes('*');
  app.use(
    cors({
      origin: allowAllOrigins ? true : config.cors.origins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
      exposedHeaders: ['ETag', 'X-Cache'],
      maxAge: 86_400,
    }),
  );

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  app.use(requestLog);
  app.use(attachPrincipal);

  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path.startsWith('/system/'),
      message: { error: 'RateLimited', message: 'Too many requests. Please slow down.' },
    }),
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/clips', clipRoutes);
  app.use('/api', catalogueRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/system', systemRoutes);

  if (!usingAzureStorage()) app.use('/api/media', mediaRoutes);

  app.get('/', (_req, res) => {
    res.json({
      service: config.appName,
      message: 'Reelix REST API. The web client is hosted separately as a static site.',
      docs: '/api/system/info',
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
