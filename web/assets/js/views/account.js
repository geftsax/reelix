import { api } from '../api.js';
import { errorPanel, statTile } from '../components.js';
import { applyFieldErrors, clear, el, relativeTime, toast } from '../ui.js';
import { currentAccount, endSession, isAdmin, isSignedIn, startSession } from '../session.js';

const signInForm = (onDone) => {
  const form = el(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        applyFieldErrors(form, null);
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;

        try {
          const data = Object.fromEntries(new FormData(form).entries());
          const result = await api.login(data);
          startSession(result);
          toast(`Welcome back, ${result.account.displayName}.`, 'ok');
          onDone();
        } catch (error) {
          applyFieldErrors(form, error.details);
          toast(error.message, 'error');
        } finally {
          button.disabled = false;
        }
      },
    },
    [
      el('div', { class: 'field' }, [
        el('label', { for: 'signin-email' }, 'Email address'),
        el('input', { type: 'email', name: 'emailAddress', id: 'signin-email', required: true, autocomplete: 'email' }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'signin-password' }, 'Password'),
        el('input', { type: 'password', name: 'password', id: 'signin-password', required: true, autocomplete: 'current-password' }),
      ]),
      el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Sign in'),
    ],
  );

  return form;
};

const joinForm = (onDone) => {
  const form = el(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        applyFieldErrors(form, null);
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;

        try {
          const data = Object.fromEntries(new FormData(form).entries());
          const result = await api.register(data);
          startSession(result);
          toast('Account created. Welcome to Reelix.', 'ok');
          onDone();
        } catch (error) {
          applyFieldErrors(form, error.details);
          toast(error.message, 'error');
        } finally {
          button.disabled = false;
        }
      },
    },
    [
      el('div', { class: 'field' }, [
        el('label', { for: 'join-name' }, 'Display name'),
        el('input', { type: 'text', name: 'displayName', id: 'join-name', required: true, maxlength: '80' }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'join-email' }, 'Email address'),
        el('input', { type: 'email', name: 'emailAddress', id: 'join-email', required: true, autocomplete: 'email' }),
      ]),
      el('div', { class: 'grid-2' }, [
        el('div', { class: 'field' }, [
          el('label', { for: 'join-password' }, 'Password'),
          el('input', { type: 'password', name: 'password', id: 'join-password', required: true, autocomplete: 'new-password' }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { for: 'join-birth' }, 'Year of birth'),
          el('input', { type: 'number', name: 'birthYear', id: 'join-birth', min: '1900', max: String(new Date().getFullYear()) }),
        ]),
      ]),
      el(
        'p',
        { class: 'field-hint' },
        'Your year of birth decides which age-rated clips you can watch. Sign-up creates a consumer account; uploading requires a creator account enrolled by an administrator.',
      ),
      el('button', { class: 'btn btn-lime btn-block', type: 'submit', style: 'margin-top:10px' }, 'Create account'),
    ],
  );

  return form;
};

const servicePanel = () => {
  const body = el('div', {}, el('p', { class: 'field-hint' }, 'Loading service state…'));

  const refresh = async () => {
    try {
      const [info, health, metrics] = await Promise.all([
        api.systemInfo(),
        api.health(),
        api.metrics(),
      ]);

      clear(body).append(
        el('div', { class: 'stat-row', style: 'margin-bottom:14px' }, [
          statTile('Requests served', metrics.requests.total),
          statTile('p95 latency', `${metrics.latencyMs.p95} ms`),
          statTile('Cache hit ratio', `${Math.round(metrics.cache.hitRatio * 100)}%`),
          statTile('SAS tokens issued', metrics.storage.sasIssued),
        ]),
        el('table', { class: 'meta-table' }, [
          el('tbody', {}, [
            el('tr', {}, [el('th', {}, 'Health'), el('td', {}, health.status)]),
            el('tr', {}, [
              el('th', {}, 'Database'),
              el('td', {}, `${info.dataProvider.active} (${health.dependencies.database.status}, ${health.dependencies.database.latencyMs ?? '—'} ms)`),
            ]),
            el('tr', {}, [el('th', {}, 'Storage'), el('td', {}, `${info.storage.active} · container ${info.storage.container}`)]),
            el('tr', {}, [el('th', {}, 'Moderation'), el('td', {}, info.moderation.provider)]),
            el('tr', {}, [el('th', {}, 'Uptime'), el('td', {}, `${metrics.uptimeSeconds}s`)]),
            el('tr', {}, [el('th', {}, 'Runtime'), el('td', {}, `${info.node} · ${info.environment}`)]),
          ]),
        ]),
      );
    } catch (error) {
      clear(body).append(errorPanel(error.message));
    }
  };

  refresh();

  return el('section', { class: 'card' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { style: 'margin:0' }, 'Service state'),
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: refresh }, 'Refresh'),
    ]),
    body,
  ]);
};

const adminPanel = () => {
  const list = el('div', {}, el('p', { class: 'field-hint' }, 'Loading accounts…'));

  const refresh = async () => {
    try {
      const result = await api.adminAccounts();
      clear(list).append(
        el('div', { style: 'overflow-x:auto' }, [
          el('table', { class: 'table' }, [
            el('thead', {}, [
              el('tr', {}, [
                el('th', {}, 'Account'),
                el('th', {}, 'Role'),
                el('th', {}, 'Channel'),
                el('th', {}, 'Joined'),
              ]),
            ]),
            el(
              'tbody',
              {},
              result.items.map((account) =>
                el('tr', {}, [
                  el('td', {}, [
                    el('div', { style: 'font-weight:600' }, account.displayName),
                    el('div', { class: 'field-hint', style: 'margin:0' }, account.emailAddress),
                  ]),
                  el('td', {}, el('span', { class: account.role === 'consumer' ? 'tag tag-muted' : 'tag tag-lime' }, account.role)),
                  el('td', {}, account.channelName ?? '—'),
                  el('td', {}, relativeTime(account.createdUtc)),
                ]),
              ),
            ),
          ]),
        ]),
      );
    } catch (error) {
      clear(list).append(errorPanel(error.message));
    }
  };

  const promoteForm = el(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        try {
          const data = Object.fromEntries(new FormData(promoteForm).entries());
          const result = await api.adminSetRole(data);
          toast(`${result.account.displayName} is now a ${result.account.role}.`, 'ok');
          promoteForm.reset();
          await refresh();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
    },
    [
      el('div', { class: 'field' }, [
        el('label', { for: 'promote-email' }, 'Account email'),
        el('input', { type: 'email', name: 'emailAddress', id: 'promote-email', required: true }),
      ]),
      el('div', { class: 'grid-2' }, [
        el('div', { class: 'field' }, [
          el('label', { for: 'promote-role' }, 'Role'),
          el('select', { name: 'role', id: 'promote-role' }, [
            el('option', { value: 'creator' }, 'creator'),
            el('option', { value: 'consumer' }, 'consumer'),
            el('option', { value: 'admin' }, 'admin'),
          ]),
        ]),
        el('div', { class: 'field' }, [
          el('label', { for: 'promote-channel' }, 'Channel name'),
          el('input', { type: 'text', name: 'channelName', id: 'promote-channel' }),
        ]),
      ]),
      el('button', { class: 'btn btn-primary', type: 'submit' }, 'Apply role'),
    ],
  );

  refresh();

  return el('section', { class: 'card' }, [
    el('h2', {}, 'Administration'),
    el(
      'p',
      { class: 'field-hint', style: 'margin-top:0' },
      'Creator enrolment is administrative by design - the public sign-up form can only create consumer accounts.',
    ),
    promoteForm,
    el('div', { style: 'margin-top:18px' }, list),
  ]);
};

export const accountView = async (mount, { query, navigate }) => {
  if (isSignedIn()) {
    const account = currentAccount();

    mount.replaceChildren(
      el('div', { class: 'page-head' }, [
        el('div', {}, [
          el('h1', {}, 'Account'),
          el('p', { class: 'page-sub' }, `Signed in as ${account.emailAddress}.`),
        ]),
        el(
          'button',
          {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: () => {
              endSession();
              navigate('#/');
            },
          },
          'Sign out',
        ),
      ]),

      el('div', { class: 'split' }, [
        el('section', { class: 'card' }, [
          el('h2', {}, 'Your profile'),
          el('table', { class: 'meta-table' }, [
            el('tbody', {}, [
              el('tr', {}, [el('th', {}, 'Name'), el('td', {}, account.displayName)]),
              el('tr', {}, [el('th', {}, 'Email'), el('td', {}, account.emailAddress)]),
              el('tr', {}, [el('th', {}, 'Role'), el('td', {}, account.role)]),
              el('tr', {}, [el('th', {}, 'Channel'), el('td', {}, account.channelName ?? '—')]),
              el('tr', {}, [el('th', {}, 'Year of birth'), el('td', {}, account.birthYear ?? 'not provided')]),
              el('tr', {}, [el('th', {}, 'Joined'), el('td', {}, relativeTime(account.createdUtc))]),
            ]),
          ]),
          account.role === 'consumer'
            ? el(
                'p',
                { class: 'field-hint' },
                'Consumer accounts can watch, search, comment and rate. Uploading requires a creator account.',
              )
            : null,
        ]),
        servicePanel(),
      ]),

      isAdmin() ? el('div', { style: 'margin-top:22px' }, adminPanel()) : null,
    );
    return;
  }

  const activeTab = query.get('tab') === 'join' ? 'join' : 'signin';
  const panel = el('div', {});

  const paint = (tab) => {
    clear(panel).append(tab === 'join' ? joinForm(() => navigate('#/')) : signInForm(() => navigate('#/')));
    tabs.querySelectorAll('.tab').forEach((button) => {
      button.classList.toggle('is-on', button.dataset.tab === tab);
    });
  };

  const tabs = el('div', { class: 'tabs' }, [
    el(
      'button',
      { class: 'tab', type: 'button', 'data-tab': 'signin', onClick: () => paint('signin') },
      'Sign in',
    ),
    el(
      'button',
      { class: 'tab', type: 'button', 'data-tab': 'join', onClick: () => paint('join') },
      'Create an account',
    ),
  ]);

  mount.replaceChildren(
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, activeTab === 'join' ? 'Create an account' : 'Welcome back'),
        el('p', { class: 'page-sub' }, 'Watch, search, comment and rate short-form video.'),
      ]),
    ]),
    el('div', { class: 'split' }, [
      el('section', { class: 'card' }, [tabs, panel]),
      el('section', { class: 'card' }, [
        el('h2', {}, 'How accounts work here'),
        el('table', { class: 'meta-table' }, [
          el('tbody', {}, [
            el('tr', {}, [
              el('th', {}, 'Consumer'),
              el('td', {}, 'Created by anyone through the form here. Can browse, search, watch, comment and rate.'),
            ]),
            el('tr', {}, [
              el('th', {}, 'Creator'),
              el('td', {}, 'Enrolled by an administrator only. Can do everything a consumer can, and publish clips with full metadata.'),
            ]),
            el('tr', {}, [
              el('th', {}, 'Age rating'),
              el('td', {}, 'Your year of birth determines which clips are visible. Guests see only U-rated content.'),
            ]),
          ]),
        ]),
      ]),
    ]),
  );

  paint(activeTab);
};
