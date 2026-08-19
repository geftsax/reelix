import { api, getSettings } from '../api.js';
import { errorPanel, loading } from '../components.js';
import {
  clear,
  el,
  formatBytes,
  formatDuration,
  initials,
  posterStyle,
  relativeTime,
  starString,
  toast,
} from '../ui.js';
import { isSignedIn } from '../session.js';
import { canGoBack, goBack } from '../nav.js';

const absolute = (url) => (url.startsWith('/') ? `${getSettings().apiBaseUrl}${url}` : url);

const commentNode = (comment) =>
  el('article', { class: 'comment' }, [
    el('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(comment.author.displayName)),
    el('div', {}, [
      el('div', { class: 'comment-head' }, [
        el('span', { class: 'comment-author' }, comment.author.displayName),
        el('span', { class: 'comment-time' }, relativeTime(comment.postedUtc)),
        comment.moderationVerdict === 'flagged'
          ? el('span', { class: 'tag', title: 'Flagged by content moderation' }, 'flagged')
          : null,
      ]),
      el('p', { class: 'comment-body' }, comment.body),
    ]),
  ]);

export const watchView = async (mount, { params }) => {
  const clipId = Number.parseInt(params.clipId, 10);
  mount.append(loading('Loading clip…'));

  let clip;
  try {
    const result = await api.clip(clipId);
    clip = result.clip;
  } catch (error) {
    mount.replaceChildren(
      errorPanel(
        error.status === 403
          ? `${error.message} Sign in with an account that meets the age requirement to watch this clip.`
          : error.message,
      ),
    );
    return;
  }

  const playerShell = el('div', { class: 'player-shell' });
  const viewCountNode = el('span', {}, `${clip.viewCount} views`);
  const expiryNode = el('p', { class: 'field-hint' }, '');

  const renderGate = (message, actionLabel, action) => {
    clear(playerShell).append(
      el('div', { class: 'player-gate' }, [
        el('div', { class: 'poster-art', style: posterStyle(clip.posterSeed) }),
        el('div', { class: 'player-gate-inner' }, [
          el('p', {}, message),
          action ? el('button', { class: 'btn btn-primary', type: 'button', onClick: action }, actionLabel) : null,
        ]),
      ]),
    );
  };

  const startPlayback = async () => {
    clear(playerShell).append(loading('Requesting a playback token…'));
    try {
      const playback = await api.playback(clipId);
      clear(playerShell).append(
        el('video', {
          controls: true,
          autoplay: true,
          preload: 'metadata',
          playsinline: true,
          src: absolute(playback.playbackUrl),
        }),
      );
      viewCountNode.textContent = `${playback.viewCount} views`;
      expiryNode.textContent = `Playback token expires at ${new Date(playback.expiresOn).toLocaleTimeString()}.`;
    } catch (error) {
      renderGate(error.message, 'Try again', startPlayback);
      toast(error.message, 'error');
    }
  };

  if (isSignedIn()) {
    renderGate('Ready to play.', 'Play clip', startPlayback);
  } else {
    renderGate('Sign in to watch this clip, leave a comment and rate it.', 'Sign in', () => {
      window.location.hash = '#/account';
    });
  }

  const averageNode = el('span', { class: 'stars' }, starString(clip.averageRating));
  const averageText = el(
    'span',
    { class: 'num', style: 'font-size:13px' },
    `${Number(clip.averageRating).toFixed(1)} from ${clip.ratingCount} rating${clip.ratingCount === 1 ? '' : 's'}`,
  );

  const paintStars = (score) => {
    starButtons.forEach((button, index) => button.classList.toggle('is-on', index < score));
  };

  const starButtons = [1, 2, 3, 4, 5].map((score) =>
    el(
      'button',
      {
        type: 'button',
        class: 'star-button',
        'aria-label': `Rate ${score} out of 5`,
        onClick: async () => {
          try {
            const result = await api.rate(clipId, score);
            paintStars(score);
            averageNode.textContent = starString(result.averageRating);
            averageText.textContent = `${Number(result.averageRating).toFixed(1)} from ${result.ratingCount} rating${result.ratingCount === 1 ? '' : 's'}`;
            toast(`Rated ${score} out of 5.`, 'ok');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      '★',
    ),
  );

  if (isSignedIn()) {
    api
      .myRating(clipId)
      .then((result) => paintStars(result.yourScore ?? 0))
      .catch(() => {});
  }

  const commentCountNode = el('span', { class: 'tag' }, String(clip.commentCount));
  const commentList = el('div', {}, loading('Loading comments…'));

  const loadComments = async () => {
    try {
      const result = await api.comments(clipId);
      commentCountNode.textContent = String(result.total);
      clear(commentList).append(
        result.items.length
          ? el('div', {}, result.items.map(commentNode))
          : el('div', { class: 'empty' }, [
              el('strong', {}, 'No comments yet.'),
              'Be the first to say something.',
            ]),
      );
    } catch (error) {
      clear(commentList).append(errorPanel(error.message));
    }
  };

  const commentInput = el('textarea', {
    name: 'body',
    id: 'commentBody',
    maxlength: '1000',
    placeholder: 'What did you think?',
    required: true,
  });

  const commentForm = el(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        const button = commentForm.querySelector('button[type="submit"]');
        button.disabled = true;

        try {
          const result = await api.postComment(clipId, commentInput.value);

          if (result.moderation.verdict === 'blocked') {
            toast(result.moderation.message ?? 'That comment was withheld.', 'warn', 6000);
          } else if (result.moderation.verdict === 'flagged') {
            toast('Posted, but flagged for review by content moderation.', 'warn');
          } else {
            toast('Comment posted.', 'ok');
          }

          commentInput.value = '';
          await loadComments();
        } catch (error) {
          toast(error.message, 'error');
        } finally {
          button.disabled = false;
        }
      },
    },
    [
      el('div', { class: 'field' }, [
        el('label', { for: 'commentBody' }, 'Add a comment'),
        commentInput,
        el(
          'p',
          { class: 'field-hint' },
          'Comments are checked by Azure AI Content Safety before they appear.',
        ),
      ]),
      el('button', { class: 'btn btn-primary', type: 'submit' }, 'Post comment'),
    ],
  );

  loadComments();

  const metaTable = el('table', { class: 'meta-table' }, [
    el('tbody', {}, [
      el('tr', {}, [el('th', {}, 'Publisher'), el('td', {}, clip.publisher)]),
      el('tr', {}, [el('th', {}, 'Producer'), el('td', {}, clip.producer)]),
      el('tr', {}, [el('th', {}, 'Genre'), el('td', {}, clip.genreName)]),
      el('tr', {}, [
        el('th', {}, 'Rating'),
        el('td', {}, `${clip.ageRatingCode} — ${clip.ageRatingLabel}`),
      ]),
      el('tr', {}, [el('th', {}, 'Runtime'), el('td', { class: 'num' }, formatDuration(clip.durationSeconds))]),
      el('tr', {}, [el('th', {}, 'File'), el('td', { class: 'num' }, `${formatBytes(clip.sizeBytes)} · ${clip.contentType}`)]),
      el('tr', {}, [el('th', {}, 'Published'), el('td', {}, relativeTime(clip.publishedUtc))]),
    ]),
  ]);

  const backControl = el('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, [
    el(
      'button',
      { class: 'crumb-back', type: 'button', onClick: goBack },
      canGoBack() ? '← Back' : '← Dashboard',
    ),
    el('span', { class: 'rule' }, '/'),
    el('a', { class: 'crumb', href: `#/discover?genre=${clip.genreCode}` }, clip.genreName),
  ]);

  mount.replaceChildren(
    el('div', { class: 'watch' }, [
      el('div', {}, [
        backControl,
        playerShell,
        expiryNode,
        el('h1', { class: 'watch-title' }, clip.title),
        el('div', { class: 'watch-byline' }, [
          el('span', { class: 'tag tag-accent' }, clip.ageRatingCode),
          el('span', { class: 'tag' }, clip.genreName),
          el('span', {}, clip.owner.channelName || clip.owner.displayName),
          el('span', { class: 'rule' }, '/'),
          viewCountNode,
        ]),
        clip.synopsis ? el('p', { class: 'synopsis' }, clip.synopsis) : null,

        el('section', { class: 'section', style: 'margin-top:34px' }, [
          el('div', { class: 'section-head' }, [
            el('h2', {}, 'Comments'),
            commentCountNode,
          ]),
          isSignedIn()
            ? commentForm
            : el('div', { class: 'empty' }, [
                el('strong', {}, 'Sign in to join the conversation.'),
                'Consumer accounts can comment and rate every clip they can watch.',
              ]),
          el('div', { style: 'margin-top:20px' }, commentList),
        ]),
      ]),

      el('aside', { class: 'stack' }, [
        el('div', { class: 'card' }, [el('h2', {}, 'Details'), metaTable]),
        el('div', { class: 'card' }, [
          el('h2', {}, 'Rating'),
          el('div', { class: 'row', style: 'margin-bottom:12px' }, [averageNode, averageText]),
          isSignedIn()
            ? el('div', {}, [
                el('label', {}, 'Your rating'),
                el('div', { class: 'rating-picker' }, starButtons),
              ])
            : el('p', { class: 'field-hint', style: 'margin:0' }, 'Sign in to rate this clip.'),
        ]),
      ]),
    ]),
  );
};
