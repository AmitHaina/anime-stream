const params = new URLSearchParams(location.search);
const epId = params.get('ep');
const seriesId = params.get('series');
const seasonId = params.get('season');
const locale = params.get('locale') || 'ja-JP';

const video = document.getElementById('video');
const overlay = document.getElementById('playerOverlay');
const overlayText = document.getElementById('overlayText');
const playerWrap = document.getElementById('playerWrap');

let hlsInstance = null;
let episodeList = [];
let currentEpIndex = -1;

// ─── Toast ───
function showToast(msg, type = 'error') {
  let c = document.getElementById('toastContainer');
  if (!c) { c = document.createElement('div'); c.id = 'toastContainer'; c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4500);
}

// ─── Overlay ───
function showOverlay(text, isError) {
  overlay.classList.remove('hidden');
  overlay.classList.toggle('error', !!isError);
  const spinner = overlay.querySelector('.spinner');
  if (spinner) spinner.style.display = isError ? 'none' : '';
  overlayText.textContent = text;
  overlay.querySelectorAll('.retry-btn').forEach(b => b.remove());
  if (isError) {
    const btn = document.createElement('button');
    btn.className = 'retry-btn';
    btn.textContent = 'Retry';
    btn.onclick = () => init();
    overlay.appendChild(btn);
  }
}
function hideOverlay() { overlay.classList.add('hidden'); }

// ─── Crypto helpers ───
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function viaProxy(cdnUrl) {
  const u = new URL(cdnUrl);
  return `/cdn/${u.host}${u.pathname}${u.search}`;
}

function makeFragDecryptLoader(aesKeyPromise) {
  return class FragDecryptLoader {
    constructor() {
      this.stats = {
        aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0,
        loading: { start: 0, first: 0, end: 0 }, parsing: { start: 0, end: 0 }, buffering: { start: 0, first: 0, end: 0 },
      };
    }
    load(context, config, callbacks) {
      const frag = context.frag;
      const start = performance.now();
      fetch(context.url)
        .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
        .then(async buf => {
          let data = buf;
          const aesKey = await aesKeyPromise;
          const iv = new Uint8Array(16);
          let n = frag.sn;
          for (let i = 15; i >= 0 && n > 0; i--) { iv[i] = n & 0xff; n = Math.floor(n / 256); }
          try { data = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, buf); }
          catch (e) { console.warn('segment decrypt failed, sn=', frag.sn, e); }
          const end = performance.now();
          this.stats.loading = { start, first: end, end };
          this.stats.loaded = this.stats.total = data.byteLength;
          callbacks.onSuccess({ url: context.url, data }, this.stats, context, null);
        })
        .catch(err => callbacks.onError({ code: 0, text: err.message }, context, null, {}));
    }
    abort() {}
    destroy() {}
  };
}

// ─── Icons ───
const PLAY_ICON = '<path d="M8 5v14l11-7z"/>';
const PAUSE_ICON = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
const VOL_ICON = '<path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z"/>';
const MUTE_ICON = '<path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.938 8.938 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';

function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Control Elements ───
const playBtn = document.getElementById('playBtn');
const bigPlayBtn = document.getElementById('bigPlayBtn');
const muteBtn = document.getElementById('muteBtn');
const volumeSlider = document.getElementById('volumeSlider');
const scrubber = document.getElementById('scrubber');
const progressPlayed = document.getElementById('progressPlayed');
const progressBuffered = document.getElementById('progressBuffered');
const timeDisplay = document.getElementById('timeDisplay');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const controlsBar = document.getElementById('controlsBar');
const skipBackBtn = document.getElementById('skipBackBtn');
const skipFwdBtn = document.getElementById('skipFwdBtn');

// ─── Play/Pause ───
function updatePlayIcon() {
  const icon = video.paused ? PLAY_ICON : PAUSE_ICON;
  playBtn.innerHTML = `<svg viewBox="0 0 24 24">${icon}</svg>`;
  bigPlayBtn.classList.toggle('visible', video.paused);
}

function togglePlay() {
  if (video.paused) video.play().catch(() => {});
  else video.pause();
}

// ─── Click vs Double-Click ───
let clickTimer = null;
video.addEventListener('click', () => {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    toggleFullscreen();
  } else {
    clickTimer = setTimeout(() => { clickTimer = null; togglePlay(); }, 280);
  }
});

playBtn.onclick = togglePlay;
bigPlayBtn.onclick = togglePlay;
video.addEventListener('play', updatePlayIcon);
video.addEventListener('pause', updatePlayIcon);

// ─── Skip ───
skipBackBtn.onclick = () => { video.currentTime = Math.max(0, video.currentTime - 10); };
skipFwdBtn.onclick = () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); };

// ─── Progress ───
video.addEventListener('timeupdate', () => {
  if (!video.duration) return;
  const pct = (video.currentTime / video.duration) * 100;
  progressPlayed.style.width = pct + '%';
  scrubber.value = String(Math.round(pct * 10));
  timeDisplay.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
});
video.addEventListener('progress', () => {
  if (!video.duration || !video.buffered.length) return;
  const end = video.buffered.end(video.buffered.length - 1);
  progressBuffered.style.width = (end / video.duration) * 100 + '%';
});
let isScrubbing = false;
scrubber.addEventListener('mousedown', () => isScrubbing = true);
scrubber.addEventListener('touchstart', () => isScrubbing = true, { passive: true });
scrubber.addEventListener('input', () => {
  if (video.duration) video.currentTime = (scrubber.value / 1000) * video.duration;
});
scrubber.addEventListener('mouseup', () => isScrubbing = false);
scrubber.addEventListener('touchend', () => isScrubbing = false);

// ─── Volume ───
muteBtn.onclick = () => { video.muted = !video.muted; };
video.addEventListener('volumechange', () => {
  muteBtn.innerHTML = `<svg viewBox="0 0 24 24">${(video.muted || video.volume === 0) ? MUTE_ICON : VOL_ICON}</svg>`;
  volumeSlider.value = video.muted ? 0 : video.volume;
});
volumeSlider.addEventListener('input', () => { video.volume = Number(volumeSlider.value); video.muted = false; });

// ─── Fullscreen ───
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else playerWrap.requestFullscreen().catch(() => {});
}
fullscreenBtn.onclick = toggleFullscreen;
document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  fullscreenBtn.innerHTML = `<svg viewBox="0 0 24 24">${isFs
    ? '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
    : '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>'
  }</svg>`;
});

// ─── Controls Visibility ───
let hideTimer;
function showControls() {
  controlsBar.classList.add('visible');
  clearTimeout(hideTimer);
  if (!video.paused) hideTimer = setTimeout(() => { if (!isScrubbing) controlsBar.classList.remove('visible'); }, 2800);
}
playerWrap.addEventListener('mousemove', showControls);
playerWrap.addEventListener('mouseleave', () => {
  if (!video.paused) { clearTimeout(hideTimer); hideTimer = setTimeout(() => controlsBar.classList.remove('visible'), 800); }
});
video.addEventListener('pause', showControls);
video.addEventListener('play', showControls);

// ─── Keyboard Shortcuts ───
document.addEventListener('keydown', e => {
  // Don't capture when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  switch (e.key) {
    case ' ':
    case 'k':
    case 'K':
      e.preventDefault();
      togglePlay();
      showControls();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      video.currentTime = Math.max(0, video.currentTime - 10);
      showControls();
      break;
    case 'ArrowRight':
      e.preventDefault();
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
      showControls();
      break;
    case 'ArrowUp':
      e.preventDefault();
      video.volume = Math.min(1, video.volume + 0.1);
      video.muted = false;
      showControls();
      break;
    case 'ArrowDown':
      e.preventDefault();
      video.volume = Math.max(0, video.volume - 0.1);
      showControls();
      break;
    case 'f':
    case 'F':
      e.preventDefault();
      toggleFullscreen();
      break;
    case 'm':
    case 'M':
      e.preventDefault();
      video.muted = !video.muted;
      showControls();
      break;
    case 'Escape':
      if (document.fullscreenElement) document.exitFullscreen();
      break;
  }
});

// ─── Episode Auto-Advance ───
video.addEventListener('ended', () => {
  if (currentEpIndex >= 0 && currentEpIndex < episodeList.length - 1) {
    const next = episodeList[currentEpIndex + 1];
    showToast(`Playing next: ${next.title || 'Episode ' + next.episode}`, 'info');
    setTimeout(() => {
      location.href = `/watch.html?ep=${next.content_id}&series=${seriesId}&season=${seasonId}`;
    }, 1500);
  }
});

// ─── Playback ───
function play(playlistUrl, aesKeyPromise) {
  // Destroy old instance to prevent leaks
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

  if (!window.Hls || !Hls.isSupported()) {
    showOverlay('Playback is not supported in this browser. Try Chrome or Firefox.', true);
    return;
  }

  showOverlay('Loading video...');
  hlsInstance = new Hls({
    fLoader: makeFragDecryptLoader(aesKeyPromise),
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
  });

  hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          showOverlay('Network error. Retrying...', false);
          hlsInstance.startLoad();
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          showOverlay('Media error. Recovering...', false);
          hlsInstance.recoverMediaError();
          break;
        default:
          showOverlay('Playback failed. This episode may be temporarily unavailable.', true);
          hlsInstance.destroy();
          hlsInstance = null;
          break;
      }
    }
  });

  video.addEventListener('canplay', hideOverlay, { once: true });
  video.addEventListener('waiting', () => showOverlay('Buffering...'));
  video.addEventListener('playing', hideOverlay);

  hlsInstance.loadSource(playlistUrl);
  hlsInstance.attachMedia(video);
  updatePlayIcon();
  showControls();
}

// ─── Episode List on Watch Page ───
async function loadEpisodeList() {
  if (!seriesId || !seasonId) return;

  const res = await fetch(`/api/v1/season/${seasonId}/episodes?page=1&limit=50&order_by=asc`);
  if (!res.ok) return;
  const eps = await res.json();
  if (!Array.isArray(eps) || !eps.length) return;

  episodeList = eps;
  currentEpIndex = eps.findIndex(e => e.content_id === epId);

  const container = document.getElementById('watchEpList');
  container.innerHTML = eps.map((ep, i) => {
    const isActive = i === currentEpIndex;
    return `<div class="watch-ep-item${isActive ? ' active' : ''}" data-ep="${ep.content_id}">
      <span class="wep-num">${ep.episode}</span>
      <div class="wep-thumb">
        <img loading="lazy" src="${ep.image}" alt="">
      </div>
      <div class="wep-info">
        <div class="wep-title">${ep.title || 'Episode ' + ep.episode}</div>
        <div class="wep-dur">${ep.duration_ms ? fmtTime(ep.duration_ms / 1000) : ''}</div>
      </div>
      ${isActive ? '<div class="wep-playing"><div class="eq-bars"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div> Now Playing</div>' : ''}
    </div>`;
  }).join('');

  // Wire clicks
  container.querySelectorAll('.watch-ep-item').forEach(item => {
    item.onclick = () => {
      const epContentId = item.dataset.ep;
      if (epContentId === epId) return; // already playing
      location.href = `/watch.html?ep=${epContentId}&series=${seriesId}&season=${seasonId}`;
    };
  });

  document.getElementById('watchEpisodes').style.display = 'block';
}

// ─── Init ───
async function init() {
  if (!epId) {
    showOverlay('No episode ID provided.', true);
    return;
  }

  showOverlay('Loading video...');

  const res = await fetch(`/api/v1/episode/${epId}/media/dash/${locale}`);
  if (!res.ok) {
    showOverlay('Failed to load episode info.', true);
    return;
  }
  const media = await res.json();

  document.getElementById('epTitle').textContent = media.title || `Episode`;
  document.title = `${media.title || 'Watch'} - AnimeStream`;

  if (!media.hls) {
    showOverlay('No video source available for this episode.', true);
    return;
  }

  const aesKeyPromise = crypto.subtle.importKey(
    'raw', hexToBytes(media.media_id), { name: 'AES-CBC' }, false, ['decrypt']
  );

  // Build track list: hard_subs first, then original
  const tracks = [...(media.hls.hard_subs || []), { label: 'Original', playlist: media.hls.playlist }];
  const localesDiv = document.getElementById('locales');
  localesDiv.innerHTML = '';
  tracks.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.textContent = t.label || t.locale;
    btn.className = i === 0 ? 'active' : '';
    btn.onclick = () => {
      [...localesDiv.children].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      play(viaProxy(t.playlist), aesKeyPromise);
    };
    localesDiv.appendChild(btn);
  });

  play(viaProxy(tracks[0].playlist), aesKeyPromise);

  // Load episode list in background
  loadEpisodeList();
}

// ─── Cleanup on leave ───
window.addEventListener('beforeunload', () => {
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
});

// ─── Header scroll ───
let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    requestAnimationFrame(() => {
      const h = document.getElementById('siteHeader');
      if (h) h.classList.toggle('scrolled', window.scrollY > 10);
      scrollTicking = false;
    });
    scrollTicking = true;
  }
});

init();