const params = new URLSearchParams(location.search);
const epId = params.get('ep');
const locale = params.get('locale') || 'ja-JP';
const video = document.getElementById('video');
const overlay = document.getElementById('playerOverlay');
const overlayText = document.getElementById('overlayText');

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
}

async function init() {
    showOverlay('Loading video...');
    const res = await fetch(`/api/v1/episode/${epId}/media/dash/${locale}`);
    const media = await res.json();
    document.getElementById('epTitle').textContent = media.title || epId;
    if (!media.hls) { showOverlay('No video source for this episode.', true); return; }

    const aesKeyPromise = crypto.subtle.importKey('raw', hexToBytes(media.media_id), { name: 'AES-CBC' }, false, ['decrypt']);

    const tracks = [{ label: 'Original', playlist: media.hls.playlist }, ...(media.hls.hard_subs || [])];
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
