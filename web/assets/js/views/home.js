import { api } from '../api.js';
import { clipGrid, errorPanel, loading, sectionHead } from '../components.js';
import { el } from '../ui.js';
import { isSignedIn } from '../session.js';

export const homeView = async (mount) => {
  mount.append(loading('Loading the dashboard…'));

  let data;
  try {
    data = await api.dashboard();
  } catch (error) {
    mount.replaceChildren(errorPanel(error.message));
    return;
  }

  const nodes = [
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, 'What people are watching'),
        el(
          'p',
          { class: 'page-sub' },
          isSignedIn()
            ? 'The newest clips on Reelix, filtered to the age rating on your account.'
            : 'Browse freely. Sign in to play clips, join the conversation and unlock age-rated titles.',
        ),
      ]),
      el('a', { class: 'btn btn-ghost', href: '#/discover' }, 'Browse the catalogue'),
    ]),
  ];

  if (data.trending?.length) {
    nodes.push(
      el('section', { class: 'section' }, [
        sectionHead('Trending', el('span', { class: 'tag' }, 'last 7 days')),
        clipGrid(data.trending, 'Nothing watched yet this week.'),
      ]),
    );
  }

  nodes.push(
    el('section', { class: 'section' }, [
      sectionHead('Latest uploads'),
      clipGrid(
        data.latest,
        'The catalogue is empty.',
        isSignedIn()
          ? ' Once a creator publishes a clip it will appear here.'
          : ' Nothing has been published yet.',
      ),
    ]),
  );

  mount.replaceChildren(...nodes);
};
