import { api, loadSettings } from './api.js';
import { renderSessionArea, restoreSession } from './session.js';
import { markNavigated } from './nav.js';
import { clear, el, toast } from './ui.js';
import { homeView } from './views/home.js';
import { discoverView } from './views/discover.js';
import { watchView } from './views/watch.js';
import { studioView } from './views/studio.js';
import { accountView } from './views/account.js';

const ROUTES = [
  { pattern: /^\/$/, view: homeView, nav: '/' },
  { pattern: /^\/discover$/, view: discoverView, nav: '/discover' },
  { pattern: /^\/watch\/(?<clipId>\d+)$/, view: watchView, nav: '/discover' },
  { pattern: /^\/studio$/, view: studioView, nav: '/studio' },
  { pattern: /^\/account$/, view: accountView, nav: '/account' },
];

const main = () => document.getElementById('main');

const parseHash = () => {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(search) };
};

const navigate = (hash) => {
  if (window.location.hash === hash) render();
  else window.location.hash = hash;
};

const highlightNav = (navKey) => {
  document.querySelectorAll('[data-nav]').forEach((node) => {
    node.classList.toggle('is-active', node.dataset.nav === navKey);
  });
};

let renderToken = 0;

const render = async () => {
  const token = (renderToken += 1);
  const { path, query } = parseHash();
  const match = ROUTES.map((route) => ({ route, result: route.pattern.exec(path) })).find(
    (entry) => entry.result,
  );

  const mount = clear(main());
  window.scrollTo(0, 0);

  if (!match) {
    mount.append(
      el('div', { class: 'empty' }, [
        el('strong', {}, 'That page does not exist.'),
        el('p', { style: 'margin:8px 0 0' }, el('a', { class: 'btn btn-ghost', href: '#/' }, 'Back to the dashboard')),
      ]),
    );
    return;
  }

  highlightNav(match.route.nav);

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = path === '/discover' ? query.get('q') ?? '' : '';

  try {
    await match.route.view(mount, {
      params: match.result.groups ?? {},
      query,
      navigate,
    });
  } catch (error) {
    if (token !== renderToken) return;
    clear(mount).append(
      el('div', { class: 'empty' }, [
        el('p', { style: 'margin:0 0 8px;font-weight:600;color:#ff6b81' }, 'This view failed to load.'),
        el('p', { style: 'margin:0' }, error.message),
      ]),
    );
  }
};

const wireChrome = () => {
  document.getElementById('searchForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const term = document.getElementById('searchInput').value.trim();
    navigate(term ? `#/discover?q=${encodeURIComponent(term)}` : '#/discover');
  });

  window.addEventListener('hashchange', () => {
    markNavigated();
    render();
  });
};

const checkApiReachable = async () => {
  try {
    await api.systemInfo();
  } catch {
    toast('The Reelix API is not reachable. Check the API base URL in config.json.', 'error', 8000);
  }
};

const start = async () => {
  await loadSettings();
  wireChrome();
  await restoreSession();
  renderSessionArea();
  await render();
  checkApiReachable();
};

start();
