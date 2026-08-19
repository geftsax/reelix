import { api, getSettings, readToken } from '../api.js';
import { errorPanel, loading, statTile } from '../components.js';
import { applyFieldErrors, el, formatBytes, toast } from '../ui.js';
import { currentAccount, isCreator } from '../session.js';

const uploadWithProgress = (formData, onProgress) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${getSettings().apiBaseUrl}/api/clips`);
    request.setRequestHeader('Authorization', `Bearer ${readToken()}`);

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });

    request.addEventListener('load', () => {
      let payload = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }

      if (request.status >= 200 && request.status < 300) resolve(payload);
      else {
        const error = new Error(payload?.message ?? `Upload failed (HTTP ${request.status}).`);
        error.status = request.status;
        error.details = payload?.details ?? null;
        reject(error);
      }
    });

    request.addEventListener('error', () => reject(new Error('The network dropped during upload.')));
    request.send(formData);
  });

export const studioView = async (mount, { navigate }) => {
  if (!isCreator()) {
    mount.replaceChildren(
      el('div', { class: 'page-head' }, el('h1', {}, 'Creator studio')),
      el('div', { class: 'empty' }, [
        el('strong', {}, 'This area is restricted to creator accounts.'),
        'Creator accounts are enrolled by an administrator — there is no public sign-up for them, so an ordinary account cannot escalate itself.',
        el('p', { style: 'margin:14px 0 0' }, el('a', { class: 'btn btn-ghost', href: '#/account' }, 'Back to account')),
      ]),
    );
    return;
  }

  mount.append(loading('Loading your channel…'));

  let reference;
  let library;
  try {
    [reference, library] = await Promise.all([api.reference(), api.library()]);
  } catch (error) {
    mount.replaceChildren(errorPanel(error.message));
    return;
  }

  const totals = library.items.reduce(
    (accumulator, clip) => ({
      views: accumulator.views + clip.viewCount,
      comments: accumulator.comments + clip.commentCount,
      bytes: accumulator.bytes + clip.sizeBytes,
    }),
    { views: 0, comments: 0, bytes: 0 },
  );

  const progressBar = el('div', { class: 'progress-bar' });
  const progressHolder = el('div', { class: 'progress', hidden: true }, progressBar);
  const fileHint = el('p', { class: 'field-hint' }, 'MP4, WebM or QuickTime, up to 64 MB.');

  const fileInput = el('input', {
    type: 'file',
    name: 'video',
    accept: 'video/mp4,video/webm,video/quicktime',
    required: true,
    onChange: (event) => {
      const file = event.target.files?.[0];
      fileHint.textContent = file
        ? `${file.name} — ${formatBytes(file.size)}`
        : 'MP4, WebM or QuickTime, up to 64 MB.';
    },
  });

  const form = el(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        applyFieldErrors(form, null);

        const button = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);

        button.disabled = true;
        progressHolder.hidden = false;
        progressBar.style.width = '0%';

        try {
          const result = await uploadWithProgress(formData, (fraction) => {
            progressBar.style.width = `${Math.round(fraction * 100)}%`;
          });

          toast(`“${result.clip.title}” published.`, 'ok');
          navigate(`#/watch/${result.clip.clipId}`);
        } catch (error) {
          applyFieldErrors(form, error.details);
          toast(error.message, 'error');
        } finally {
          button.disabled = false;
          progressHolder.hidden = true;
        }
      },
    },
    [
      el('div', { class: 'field' }, [
        el('label', { for: 'title' }, 'Title'),
        el('input', { type: 'text', name: 'title', id: 'title', maxlength: '160', required: true }),
      ]),

      el('div', { class: 'grid-2' }, [
        el('div', { class: 'field' }, [
          el('label', { for: 'publisher' }, 'Publisher'),
          el('input', { type: 'text', name: 'publisher', id: 'publisher', required: true }),
        ]),
        el('div', { class: 'field' }, [
          el('label', { for: 'producer' }, 'Producer'),
          el('input', { type: 'text', name: 'producer', id: 'producer', required: true }),
        ]),
      ]),

      el('div', { class: 'grid-2' }, [
        el('div', { class: 'field' }, [
          el('label', { for: 'genreCode' }, 'Genre'),
          el(
            'select',
            { name: 'genreCode', id: 'genreCode', required: true },
            reference.genres.map((genre) =>
              el('option', { value: genre.genreCode }, genre.genreName),
            ),
          ),
        ]),
        el('div', { class: 'field' }, [
          el('label', { for: 'ageRatingCode' }, 'Age rating'),
          el(
            'select',
            { name: 'ageRatingCode', id: 'ageRatingCode', required: true },
            reference.ageRatings.map((rating) =>
              el('option', { value: rating.ageRatingCode }, `${rating.ageRatingCode} — ${rating.ratingLabel}`),
            ),
          ),
        ]),
      ]),

      el('div', { class: 'field' }, [
        el('label', { for: 'synopsis' }, 'Synopsis'),
        el('textarea', { name: 'synopsis', id: 'synopsis', maxlength: '1000' }),
      ]),

      el('div', { class: 'field' }, [
        el('label', { for: 'durationSeconds' }, 'Duration (seconds)'),
        el('input', { type: 'number', name: 'durationSeconds', id: 'durationSeconds', min: '0' }),
      ]),

      el('div', { class: 'field' }, [el('label', { for: 'video' }, 'Video file'), fileInput, fileHint]),

      progressHolder,
      el('button', { class: 'btn btn-lime btn-block', type: 'submit', style: 'margin-top:14px' }, 'Publish clip'),
    ],
  );

  const libraryRows = library.items.map((clip) =>
    el('tr', {}, [
      el('td', {}, el('a', { href: `#/watch/${clip.clipId}`, style: 'font-weight:600' }, clip.title)),
      el('td', {}, el('span', { class: 'tag' }, clip.ageRatingCode)),
      el('td', { class: 'num' }, String(clip.viewCount)),
      el('td', { class: 'num' }, String(clip.commentCount)),
      el('td', { class: 'num' }, clip.ratingCount ? Number(clip.averageRating).toFixed(1) : '—'),
      el(
        'td',
        {},
        el(
          'button',
          {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: async (event) => {
              const next = clip.publishState === 'published' ? 'hidden' : 'published';
              try {
                await api.setClipState(clip.clipId, next);
                clip.publishState = next;
                event.target.textContent = next === 'published' ? 'Unpublish' : 'Publish';
                toast(`“${clip.title}” is now ${next}.`, 'ok');
              } catch (error) {
                toast(error.message, 'error');
              }
            },
          },
          clip.publishState === 'published' ? 'Unpublish' : 'Publish',
        ),
      ),
    ]),
  );

  mount.replaceChildren(
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', {}, currentAccount().channelName || 'Creator studio'),
        el(
          'p',
          { class: 'page-sub' },
          `Signed in as ${currentAccount().displayName}. Only creator accounts can publish to Reelix.`,
        ),
      ]),
    ]),

    el('section', { class: 'section' }, [
      el('div', { class: 'stat-row' }, [
        statTile('Published', library.total),
        statTile('Views', totals.views),
        statTile('Comments', totals.comments),
        statTile('Storage', formatBytes(totals.bytes)),
      ]),
    ]),

    el('div', { class: 'split' }, [
      el('section', { class: 'card' }, [el('h2', {}, 'Publish a clip'), form]),

      el('section', { class: 'card' }, [
        el('h2', {}, 'Your library'),
        library.items.length
          ? el('div', { style: 'overflow-x:auto' }, [
              el('table', { class: 'table' }, [
                el('thead', {}, [
                  el('tr', {}, [
                    el('th', {}, 'Title'),
                    el('th', {}, 'Cert'),
                    el('th', {}, 'Views'),
                    el('th', {}, 'Comments'),
                    el('th', {}, 'Score'),
                    el('th', {}, ''),
                  ]),
                ]),
                el('tbody', {}, libraryRows),
              ]),
            ])
          : el('div', { class: 'empty' }, [
              el('strong', {}, 'Nothing published yet.'),
              'Use the form on the left — the title, publisher, producer, genre and age rating are all required.',
            ]),
      ]),
    ]),
  );
};
