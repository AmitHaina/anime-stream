const params = new URLSearchParams(location.search);
const epId = params.get('ep');
const locale = params.get('locale') || 'ja-JP';
const video = document.getElementById('video');
const overlay = document.getElementById('playerOverlay');
const overlayText = document.getElementById('overlayText');
const playerWrap = document.getElementById('playerWrap');

function showOverlay(text, isError) {
    overlay.classList.remove('hidden');
    overlay.classList.toggle('error', !!isError);
    overlayText.textContent = text;
    overlay.querySelectorAll('.retry-btn').forEach((b) => b.remove());
    if (isError) {
        const btn = document.createElement('button');
        btn.className = 'retry-btn';
        btn.textContent = 'Retry';
        btn.onclick = () => init();
        overlay.appendChild(btn);
    }
}
function hideOverlay() { overlay.classList.add('hidden'); }

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
}

// CDN also has no Access-Control-Allow-Origin, so every CDN URL is routed through our own /cdn/<host>/ mirror.
function viaProxy(cdnUrl) {
    const u = new URL(cdnUrl);
    return `/cdn/${u.host}${u.pathname}${u.search}`;
}

// IV is a big-endian counter seeded from frag.sn; only fLoader is overridden so hls.js's own loader still handles manifest/playlist requests.
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
                .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
                .then(async (buf) => {
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
                .catch((err) => callbacks.onError({ code: 0, text: err.message }, context, null, {}));
        }
        abort() {}
        destroy() {}
    };
}

// --- Custom Netflix-style controls (native <video controls> swapped out for a themed bar) ---
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

const PLAY_ICON = '<path d="M8 5v14l11-7z"/>';
const PAUSE_ICON = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
const VOL_ICON = '<path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z"/>';
const MUTE_ICON = '<path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.938 8.938 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';

function fmtTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function updatePlayIcon() {
    const icon = video.paused ? PLAY_ICON : PAUSE_ICON;
    playBtn.innerHTML = `<svg viewBox="0 0 24 24">${icon}</svg>`;
    bigPlayBtn.classList.toggle('visible', video.paused);
}

function togglePlay() { video.paused ? video.play() : video.pause(); }

playBtn.onclick = togglePlay;
bigPlayBtn.onclick = togglePlay;
video.addEventListener('click', togglePlay);
video.addEventListener('play', updatePlayIcon);
video.addEventListener('pause', updatePlayIcon);

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
scrubber.addEventListener('input', () => {
    if (video.duration) video.currentTime = (scrubber.value / 1000) * video.duration;
});

muteBtn.onclick = () => { video.muted = !video.muted; };
video.addEventListener('volumechange', () => {
    muteBtn.innerHTML = `<svg viewBox="0 0 24 24">${(video.muted || video.volume === 0) ? MUTE_ICON : VOL_ICON}</svg>`;
});
volumeSlider.addEventListener('input', () => { video.volume = Number(volumeSlider.value); video.muted = false; });

fullscreenBtn.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else playerWrap.requestFullscreen();
};

let hideTimer;
function showControls() {
    controlsBar.classList.add('visible');
    clearTimeout(hideTimer);
    if (!video.paused) hideTimer = setTimeout(() => controlsBar.classList.remove('visible'), 2500);
}
playerWrap.addEventListener('mousemove', showControls);
playerWrap.addEventListener('mouseenter', showControls);
video.addEventListener('pause', showControls);
video.addEventListener('play', showControls);

function play(playlistUrl, aesKeyPromise) {
    if (!window.Hls || !Hls.isSupported()) { showOverlay('Playback is not supported in this browser.', true); return; }
    showOverlay('Loading video...');
    const hls = new Hls({ fLoader: makeFragDecryptLoader(aesKeyPromise) });
    hls.on(Hls.Events.ERROR, (_evt, data) => {
        console.log('HLS_ERROR', JSON.stringify(data, (k, v) => (k === 'frag' || k === 'context') ? undefined : v));
        if (data.fatal) showOverlay('Playback failed. This episode may be temporarily unavailable.', true);
    });
    video.addEventListener('canplay', hideOverlay, { once: true });
    video.addEventListener('waiting', () => showOverlay('Buffering...'));
    video.addEventListener('playing', hideOverlay);
    hls.loadSource(playlistUrl);
    hls.attachMedia(video);
    updatePlayIcon();
    showControls();
}

async function init() {
    showOverlay('Loading video...');
    const res = await fetch(`/api/v1/episode/${epId}/media/dash/${locale}`);
    const media = await res.json();
    document.getElementById('epTitle').textContent = media.title || epId;
    if (!media.hls) { showOverlay('No video source for this episode.', true); return; }

    const aesKeyPromise = crypto.subtle.importKey('raw', hexToBytes(media.media_id), { name: 'AES-CBC' }, false, ['decrypt']);

    // Default to a subtitled track (most viewers aren't native Japanese speakers) - "Original" (no subs) is opt-in.
    const tracks = [...(media.hls.hard_subs || []), { label: 'Original', playlist: media.hls.playlist }];
    const localesDiv = document.getElementById('locales');
    localesDiv.innerHTML = '';
    tracks.forEach((t, i) => {
        const btn = document.createElement('button');
        btn.textContent = t.label || t.locale;
        btn.className = i === 0 ? 'active' : '';
        btn.onclick = () => {
            [...localesDiv.children].forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            play(viaProxy(t.playlist), aesKeyPromise);
        };
        localesDiv.appendChild(btn);
    });
    play(viaProxy(tracks[0].playlist), aesKeyPromise);
}

init();
