import { api } from '../api.js';
import { clipGrid, errorPanel, loading } from '../components.js';
import { el, render } from '../ui.js';

const SORTS = [
  { value: 'recent', label: 'Newest' },
  { value: 'popular', label: 'Most watched' },
  { value: 'rated', label: 'Best rated' },
];

export const discoverView = async (mount, { query, navigate }) => {
  const state = {
    q: query.get('q') ?? '',
    genre: query.get('genre') ?? '',
    rating: query.get('rating') ?? '',
    sort: query.get('sort') ?? 'recent',
    page: Number.parseInt(query.get('page') ?? '1', 10) || 1,
    pageSize: 12,
  };

  mount.append(loading('Searching…'));

  let reference;
  let results;
  try {
    [reference, results] = await Promise.all([api.reference(), api.search(state)]);
  } catch (error) {
    mount.replaceChildren(errorPanel(error.message));
    return;
  }

  const go = (changes) => {
    const next = { ...state, ...changes };
    if (!('page' in changes)) next.page = 1;

    const params = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (key === 'pageSize') return;
      if (value !== '' && value !== null && !(key === 'page' && value === 1)) {
        params.set(key, value);
      }
    });

    navigate(`#/discover${params.toString() ? `?${params}` : ''}`);
  };

  const genreSelect = el(
    'select',
    { name: 'genre', onChange: (event) => go({ genre: event.target.value }) },
    [
      el('option', { value: '', selected: state.genre === '' }, 'All genres'),
      ...reference.genres.map((genre) =>
        el(
          'option',
          { value: genre.genreCode, selected: state.genre === genre.genreCode },
          genre.genreName,
        ),
      ),
    ],
  );

  const ratingSelect = el(
    'select',
    { name: 'rating', onChange: (event) => go({ rating: event.target.value }) },
    [
      el('option', { value: '', selected: state.rating === '' }, 'All age ratings'),
      ...reference.ageRatings.map((rating) =>
        el(
          'option',
          { value: rating.ageRatingCode, selected: state.rating === rating.ageRatingCode },
          `${rating.ageRatingCode} — ${rating.ratingLabel}`,
        ),
      ),
    ],
  );

  const totalPages = Math.max(1, Math.ceil(results.total / state.pageSize));

  const pager = el('div', { class: 'row', style: 'justify-content:center;margin-top:22px' }, [
    el(
      'button',
      {
        class: 'btn btn-ghost',
        type: 'button',
        disabled: state.page <= 1,
        onClick: () => go({ page: state.page - 1 }),
      },
      '‹ Previous',
    ),
    el('span', { style: 'color:var(--text-muted);font-size:13px' }, `Page ${state.page} of ${totalPages}`),
    el(
      'button',
      {
        class: 'btn btn-ghost',
        type: 'button',
        disabled: state.page >= totalPages,
        onClick: () => go({ page: state.page + 1 }),
      },
      'Next ›',
    ),
  ]);

  render(
    mount,
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, state.q ? `“${state.q}”` : 'The catalogue'),
        el(
          'p',
          { class: 'page-sub' },
          `${results.total} clip${results.total === 1 ? '' : 's'} match${results.total === 1 ? 'es' : ''} your filters.`,
        ),
      ]),
    ]),

    el('div', { class: 'filters' }, [
      el('div', { class: 'field' }, [el('label', { for: 'genre' }, 'Genre'), genreSelect]),
      el('div', { class: 'field' }, [el('label', { for: 'rating' }, 'Age rating'), ratingSelect]),
      el('div', { class: 'field' }, [
        el('label', {}, 'Order'),
        el(
          'div',
          { class: 'chip-row' },
          SORTS.map((sort) =>
            el(
              'button',
              {
                type: 'button',
                class: `chip${state.sort === sort.value ? ' is-on' : ''}`,
                onClick: () => go({ sort: sort.value }),
              },
              sort.label,
            ),
          ),
        ),
      ]),
      state.q || state.genre || state.rating
        ? el(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onClick: () => navigate('#/discover'),
            },
            'Clear filters',
          )
        : null,
    ]),

    clipGrid(
      results.items,
      'Nothing matches those filters.',
      ' Try a broader search term, or clear the genre and age rating.',
    ),
    results.total > state.pageSize ? pager : null,
  );
};
