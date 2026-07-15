// ═══════════════════════════════════════════
//  series.js — Series detail page (fixed)
// ═══════════════════════════════════════════

const params = new URLSearchParams(location.search);
const seriesId = params.get('id');
const episodesDiv = document.getElementById('episodes');
const seasonsSelect = document.getElementById('seasons');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const loadMoreBtn = document.getElementById('loadMoreBtn');
let currentSeasons = [];
let currentEpPage = 1;
let currentSeasonId = null;
let allEpisodesLoaded = false;

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

// ─── Helpers ───
function backdrop(item) {
  const wide = item.images && item.images.find(i => i.type === 'poster_wide');
  return (wide && wide.url) || item.image || (item.images && item.images[0] && item.images[0].url) || '';
}
function fmtDuration(ms) {
  if (!ms) return '';
  const min = Math.round(ms / 60000);
  return `${min}m`;
}
async function safeFetch(url) {
  try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { return null; }
}
function poster(item) {
  return item.image || (item.images && item.images[0] && item.images[0].url) || '';
}

// ─── Episodes ───
async function loadEpisodes(seasonId, append = false) {
  if (!append) {
    episodesDiv.innerHTML = '';
    currentEpPage = 1;
    allEpisodesLoaded = false;
    loadMoreWrap.style.display = 'none';
  }

  const data = await safeFetch(`/api/v1/season/${seasonId}/episodes?page=${currentEpPage}&limit=20&order_by=asc`);
  if (!data || !Array.isArray(data) || !data.length) {
    if (!append) episodesDiv.innerHTML = '<div class="no-results" style="padding:30px 0">No episodes available.</div>';
    allEpisodesLoaded = true;
    loadMoreWrap.style.display = 'none';
    return;
  }

  data.forEach(ep => {
    const row = document.createElement('div');
    row.className = 'ep-row';
    row.innerHTML = `
      <div class="ep-number">${ep.episode}</div>
      <div class="ep-thumb">
        <img loading="lazy" src="${ep.image}" alt="">
        <div class="ep-play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
        ${ep.duration_ms ? `<span class="ep-duration-badge">${fmtDuration(ep.duration_ms)}</span>` : ''}
      </div>
      <div class="ep-info">
        <p class="ep-title">${ep.title || `Episode ${ep.episode}`}</p>
        ${ep.duration_ms ? `<p class="ep-duration-text">${fmtDuration(ep.duration_ms)}</p>` : ''}
      </div>`;
    row.onclick = () => location.href = `/watch.html?ep=${ep.content_id}&series=${seriesId}&season=${seasonId}`;
    episodesDiv.appendChild(row);
  });

  // Set play button on first load
  if (!append && data.length) {
    document.getElementById('heroPlayBtn').onclick = () =>
      location.href = `/watch.html?ep=${data[0].content_id}&series=${seriesId}&season=${seasonId}`;
  }

  // Show/hide load more
  if (data.length < 20) {
    allEpisodesLoaded = true;
    loadMoreWrap.style.display = 'none';
  } else {
    loadMoreWrap.style.display = 'block';
  }
}

loadMoreBtn.onclick = () => {
  if (allEpisodesLoaded || !currentSeasonId) return;
  currentEpPage++;
  loadEpisodes(currentSeasonId, true);
};

// ─── Similar ───
async function loadSimilar(series) {
  // Try to find similar content via genre search
  const genres = series.genres || [];
  const query = genres.length ? (typeof genres[0] === 'string' ? genres[0] : genres[0].name || genres[0].title || '') : series.title.split(' ')[0];
  if (!query) return;

  const data = await safeFetch(`/api/v1/search?query=${encodeURIComponent(query)}&t=series&limit=15`);
  const items = (data && data.series || []).filter(s => s.content_id !== seriesId);
  if (!items.length) return;

  const track = document.getElementById('similarTrack');
  track.innerHTML = items.map(item => `<div class="card" onclick="location.href='/series.html?id=${item.content_id}'">
    <div class="card-img">
      <img loading="lazy" src="${poster(item)}" alt="${item.title || ''}">
      <div class="card-overlay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
    </div>
    <div class="card-title">${item.title || ''}</div>
  </div>`).join('');

  document.getElementById('similarSection').style.display = 'block';
  // Wire nav
  const row = document.getElementById('similarRow');
  const prev = row.querySelector('.row-nav.prev');
  const next = row.querySelector('.row-nav.next');
  prev.onclick = () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior: 'smooth' });
  next.onclick = () => track.scrollBy({ left: track.clientWidth * 0.85, behavior: 'smooth' });
}

// ─── Search (series page) ───
document.getElementById('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = document.getElementById('searchInput').value.trim();
  if (q) location.href = `/?q=${encodeURIComponent(q)}`;
});
document.getElementById('searchClear').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.remove('visible');
});

// ─── Header Scroll ───
let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    requestAnimationFrame(() => {
      document.getElementById('siteHeader').classList.toggle('scrolled', window.scrollY > 10);
      scrollTicking = false;
    });
    scrollTicking = true;
  }
});

// ─── Init ───
async function init() {
  if (!seriesId) {
    document.getElementById('seriesSkeleton').style.display = 'none';
    document.getElementById('seriesContent').style.display = 'block';
    document.getElementById('seriesTitle').textContent = 'No series ID provided.';
    return;
  }

  const series = await safeFetch(`/api/v1/series/${seriesId}`);
  if (!series) {
    document.getElementById('seriesSkeleton').style.display = 'none';
    document.getElementById('seriesContent').style.display = 'block';
    document.getElementById('seriesTitle').textContent = 'Failed to load series.';
    showToast('Failed to load series details.');
    return;
  }

  // Hide skeleton, show content
  document.getElementById('seriesSkeleton').style.display = 'none';
  document.getElementById('seriesContent').style.display = 'block';
  document.getElementById('epSkeleton').remove();

  // Fill series info
  document.getElementById('seriesTitle').textContent = series.title || '';
  document.getElementById('seriesDesc').textContent = series.description || '';
  document.getElementById('seriesHero').style.backgroundImage = `url(${backdrop(series)})`;

  // Meta
  currentSeasons = series.seasons || [];
  const totalEps = currentSeasons.reduce((sum, s) => sum + (s.episode_count || 0), 0);
  document.getElementById('seriesMeta').innerHTML = `
    <span class="badge">HD</span>
    <span>${currentSeasons.length} Season${currentSeasons.length === 1 ? '' : 's'}</span>
    <span>&middot;</span>
    <span>${totalEps} Episodes</span>`;

  // Genre tags
  const genreTags = document.getElementById('genreTags');
  const genres = series.genres || [];
  if (genres.length) {
    genreTags.innerHTML = genres.map(g => {
      const name = typeof g === 'string' ? g : (g.name || g.title || '');
      return name ? `<button class="genre-tag" onclick="location.href='/?q=${encodeURIComponent(name)}'">${name}</button>` : '';
    }).join('');
  }

  // Seasons
  seasonsSelect.innerHTML = currentSeasons.map((s, i) =>
    `<option value="${s.content_id}">${s.title}${s.episode_count ? ` (${s.episode_count} eps)` : ''}</option>`
  ).join('');
  seasonsSelect.onchange = () => {
    currentSeasonId = seasonsSelect.value;
    loadEpisodes(currentSeasonId);
  };

  if (currentSeasons.length) {
    currentSeasonId = currentSeasons[0].content_id;
    loadEpisodes(currentSeasonId);
  }

  // Similar (background)
  loadSimilar(series);
}

init();