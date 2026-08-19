import { api, clearToken, readToken, writeToken } from './api.js';
import { clear, el, initials } from './ui.js';

const state = { account: null };

export const currentAccount = () => state.account;
export const isSignedIn = () => Boolean(state.account);
export const isCreator = () => ['creator', 'admin'].includes(state.account?.role);
export const isAdmin = () => state.account?.role === 'admin';

export const restoreSession = async () => {
  if (!readToken()) {
    state.account = null;
    return null;
  }

  try {
    const result = await api.me();
    state.account = result.account;
  } catch {
    clearToken();
    state.account = null;
  }

  return state.account;
};

export const startSession = ({ account, token }) => {
  writeToken(token);
  state.account = account;
  renderSessionArea();
  return account;
};

export const endSession = () => {
  clearToken();
  state.account = null;
  renderSessionArea();
};

export const renderSessionArea = () => {
  const area = document.getElementById('sessionArea');
  if (!area) return;

  clear(area);

  document.querySelectorAll('[data-role="creator"]').forEach((node) => {
    node.hidden = !isCreator();
  });

  if (!state.account) {
    area.append(
      el('a', { class: 'btn btn-ghost', href: '#/account' }, 'Sign in'),
      el('a', { class: 'btn btn-primary', href: '#/account?tab=join' }, 'Join'),
    );
    return;
  }

  area.append(
    el('a', { class: 'session-chip', href: '#/account', title: 'Account settings' }, [
      el('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(state.account.displayName)),
      el('span', { class: 'session-name' }, [
        state.account.displayName,
        el('span', { class: 'session-role' }, state.account.role),
      ]),
    ]),
    el(
      'button',
      {
        class: 'btn btn-quiet',
        type: 'button',
        onClick: () => {
          endSession();
          window.location.hash = '#/';
        },
      },
      'Sign out',
    ),
  );
};
