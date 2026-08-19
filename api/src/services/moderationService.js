import { config, moderationEnabled } from '../config.js';
import { recordModeration } from './metrics.js';

const CATEGORIES = ['Hate', 'SelfHarm', 'Sexual', 'Violence'];

const LOCAL_RULES = [
  { category: 'Hate', severity: 6, pattern: /\b(kill yourself|kys)\b/i },
  { category: 'Violence', severity: 4, pattern: /\b(i will (hurt|kill|find) you)\b/i },
  { category: 'Hate', severity: 4, pattern: /\b(scum|vermin)\b/i },
  { category: 'Sexual', severity: 4, pattern: /\b(explicit sexual content)\b/i },
];

const verdictFor = (severity) => {
  if (severity >= config.moderation.blockSeverity) return 'blocked';
  if (severity >= config.moderation.flagSeverity) return 'flagged';
  return 'allowed';
};

const localAnalyse = (text) => {
  let worst = { category: null, severity: 0 };
  for (const rule of LOCAL_RULES) {
    if (rule.pattern.test(text) && rule.severity > worst.severity) {
      worst = { category: rule.category, severity: rule.severity };
    }
  }
  return worst;
};

const callContentSafety = async (text) => {
  // Skipped entirely when no endpoint is configured.
  const url = `${config.moderation.endpoint.replace(/\/+$/, '')}/contentsafety/text:analyze?api-version=${config.moderation.apiVersion}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.moderation.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': config.moderation.key,
      },
      body: JSON.stringify({
        text: text.slice(0, 1000),
        categories: CATEGORIES,
        outputType: 'FourSeverityLevels',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Content Safety returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const analyses = payload.categoriesAnalysis ?? [];

    return analyses.reduce(
      (worst, entry) =>
        Number(entry.severity ?? 0) > worst.severity
          ? { category: entry.category, severity: Number(entry.severity) }
          : worst,
      { category: null, severity: 0 },
    );
  } finally {
    clearTimeout(timer);
  }
};

export const moderateText = async (text) => {
  if (!moderationEnabled()) {
    const local = localAnalyse(text);
    const verdict = local.severity ? verdictFor(local.severity) : 'skipped';
    recordModeration(verdict === 'skipped' ? 'skipped' : verdict);
    return {
      verdict,
      severity: local.severity,
      category: local.category,
      isVisible: verdict !== 'blocked',
      source: 'local-rules',
      message:
        verdict === 'blocked'
          ? 'This comment was withheld because it breaches the community guidelines.'
          : null,
    };
  }

  try {
    const worst = await callContentSafety(text);
    const verdict = verdictFor(worst.severity);
    recordModeration(verdict);
    return {
      verdict,
      severity: worst.severity,
      category: worst.category,
      isVisible: verdict !== 'blocked',
      source: 'azure-content-safety',
      message:
        verdict === 'blocked'
          ? 'This comment was withheld because it breaches the community guidelines.'
          : null,
    };
  } catch (error) {
    const local = localAnalyse(text);
    const verdict = local.severity >= config.moderation.blockSeverity ? 'blocked' : 'skipped';
    recordModeration(verdict, { failed: true });
    return {
      verdict,
      severity: local.severity,
      category: local.category,
      isVisible: verdict !== 'blocked',
      source: 'local-rules-fallback',
      message:
        verdict === 'blocked'
          ? 'This comment was withheld because it breaches the community guidelines.'
          : null,
      error: error.message,
    };
  }
};

export const moderationInfo = () => ({
  provider: moderationEnabled() ? 'azure-content-safety' : 'local-rules',
  endpointConfigured: Boolean(config.moderation.endpoint),
  blockSeverity: config.moderation.blockSeverity,
  flagSeverity: config.moderation.flagSeverity,
});
