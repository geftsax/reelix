export const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  });

  (Array.isArray(children) ? children : [children])
    .filter((child) => child !== null && child !== undefined && child !== false)
    .forEach((child) => {
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });

  return node;
};

export const render = (target, ...children) => {
  target.replaceChildren(
    ...children.filter((child) => child !== null && child !== undefined && child !== false),
  );
  return target;
};

export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};

export const toast = (message, tone = 'ok', ttlMs = 4200) => {
  const stack = document.getElementById('toastStack');
  if (!stack) return;

  const node = el('div', { class: `toast toast-${tone}`, role: 'status', text: message });
  stack.append(node);

  setTimeout(() => {
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, ttlMs);
};

export const initials = (name = '?') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';

export const posterStyle = (seed = 0) => {
  const hue = 12 + (Math.abs(Number(seed) || 0) % 46);
  return (
    `background: linear-gradient(148deg,` +
    ` hsl(${hue} 44% 33%) 0%,` +
    ` hsl(${Math.max(0, hue - 16)} 36% 15%) 100%);`
  );
};

export const relativeTime = (value) => {
  if (!value) return '';
  const then = new Date(value.endsWith?.('Z') || /[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
  if (Number.isNaN(then.getTime())) return '';

  const seconds = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return 'just now';

  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];

  for (const [unit, size] of units) {
    const amount = Math.floor(seconds / size);
    if (amount >= 1) return `${amount} ${unit}${amount > 1 ? 's' : ''} ago`;
  }
  return 'just now';
};

export const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
};

export const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return '—';
  const total = Number(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

export const starString = (average) => {
  const rounded = Math.round(Number(average) || 0);
  return '★'.repeat(rounded) + '☆'.repeat(Math.max(0, 5 - rounded));
};

export const applyFieldErrors = (form, details) => {
  form.querySelectorAll('.field-error').forEach((node) => node.remove());
  if (!details) return;

  Object.entries(details).forEach(([field, message]) => {
    const input = form.querySelector(`[name="${field}"]`);
    const holder = input?.closest('.field') ?? form;
    holder.append(el('p', { class: 'field-error', text: message }));
  });
};
