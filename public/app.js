// ═══════════════════════════════════════════
//  app.js — Homepage logic (fixed)
// ═══════════════════════════════════════════

const heroEl = document.getElementById('hero');
const contentEl = document.getElementById('content');
const genreBar = document.getElementById('genreBar');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy',
  'Horror', 'Mecha', 'Mystery', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Sports', 'Supernatural', 'Thriller'
];

// ─── Toast ───
function showToast(msg, type = 'error') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4500);
}

// ─── Helpers ───
function poster(item) {
  return item.image || (item.images && item.images[0] && item.images[0].url) || '';
}
function widePoster(item) {
  const w = item.images && item.images.find(i => i.type === 'poster_wide');
  return (w && w.url) || poster(item);
}
async function safeFetch(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) { return null; }
}

// ─── Genre Bar ───
function renderGenreBar() {
  GENRES.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'genre-pill';
    btn.textContent = g;
    btn.onclick = () => {
      document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      searchInput.value = g;
      searchClear.classList.add('visible');
      search(g);
    };
    genreBar.appendChild(btn);
  });
}

// ─── Skeletons ───
function showHeroSkeleton() {
  heroEl.className = 'skeleton-hero';
  heroEl.innerHTML = `
    <div class="skeleton skeleton-shimmer" style="width:320px;height:42px;margin-bottom:14px"></div>
    <div class="skeleton skeleton-shimmer" style="width:480px;height:14px;margin-bottom:8px"></div>
    <div class="skeleton skeleton-shimmer" style="width:380px;height:14px;margin-bottom:24px"></div>
    <div class="skeleton skeleton-shimmer" style="width:150px;height:42px;border-radius:4px"></div>`;
}
function showRowSkeletons(count = 3) {
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'skeleton-row';
    row.dataset.skeleton = '1';
    let cards = '';
    for (let j = 0; j < 7; j++) cards += '<div class="skeleton skeleton-shimmer card-skeleton"></div>';
    row.innerHTML = `
      <div class="skeleton skeleton-shimmer" style="width:180px;height:22px;margin-bottom:14px"></div>
      <div class="skeleton-cards">${cards}</div>`;
    contentEl.appendChild(row);
  }
}
function clearSkeletons() {
  document.querySelectorAll('[data-skeleton]').forEach(el => el.remove());
}

// ─── Hero ───
let heroItems = [];
let heroIndex = 0;
let heroTimer = null;

function renderHeroSlide(item) {
  heroEl.className = 'hero';
  heroEl.style.backgroundImage = `url(${widePoster(item) || poster(item)})`;

  let dotsHtml = '';
  if (heroItems.length > 1) {
    dotsHtml = '<div class="hero-dots" id="heroDots">';
    heroItems.forEach((_, i) => {
      dotsHtml += `<button class="hero-dot${i === heroIndex ? ' active' : ''}" data-idx="${i}" aria-label="Slide ${i + 1}"></button>`;
    });
    dotsHtml += '</div>';
  }

  heroEl.innerHTML = `
    <div class="hero-content" id="heroContent">
      <h2>${item.title}</h2>
      <p>${item.description || ''}</p>
      <div class="hero-actions">
        <button class="btn-play" onclick="location.href='/series.html?id=${item.content_id}'">
          <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor"><path d="M8 5v14l11-7z"/></svg> View
        </button>
        <button class="btn-info" onclick="location.href='/series.html?id=${item.content_id}'">
          <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg> More Info
        </button>
      </div>
    </div>
    ${dotsHtml}`;

  // Wire dots
  heroEl.querySelectorAll('.hero-dot').forEach(dot => {
    dot.onclick = () => goToHeroSlide(Number(dot.dataset.idx));
  });
}

function initHero(items) {
  heroItems = items.slice(0, 5);
  heroIndex = 0;
  renderHeroSlide(heroItems[0]);
  if (heroItems.length > 1) {
    heroTimer = setInterval(advanceHero, 7000);
    heroEl.addEventListener('mouseenter', () => clearInterval(heroTimer));
    heroEl.addEventListener('mouseleave', () => { heroTimer = setInterval(advanceHero, 7000); });
  }
}

async function goToHeroSlide(idx) {
  if (idx === heroIndex || !heroItems.length) return;
  const content = document.getElementById('heroContent');
  if (content) content.classList.add('fade-out');
  await new Promise(r => setTimeout(r, 350));
  heroIndex = idx;
  heroEl.style.backgroundImage = `url(${widePoster(heroItems[idx]) || poster(heroItems[idx])})`;
  // Update content
  const item = heroItems[idx];
  const hc = document.getElementById('heroContent');
  if (hc) {
    hc.querySelector('h2').textContent = item.title;
    hc.querySelector('p').textContent = item.description || '';
    hc.querySelectorAll('.hero-actions button').forEach(b => {
      b.onclick = () => location.href = `/series.html?id=${item.content_id}`;
    });
  }
  heroEl.querySelectorAll('.hero-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  if (hc) requestAnimationFrame(() => hc.classList.remove('fade-out'));
}

function advanceHero() {
  goToHeroSlide((heroIndex + 1) % heroItems.length);
}

// ─── Cards & Rows ───
function cardHtml(item) {
  return `<div class="card" onclick="location.href='/series.html?id=${item.content_id}'">
    <div class="card-img">
      <img loading="lazy" src="${poster(item)}" alt="${item.title || ''}">
      <div class="card-overlay">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>
    <div class="card-title">${item.title || ''}</div>
  </div>`;
}

function addRow(title, items) {
  if (!items || !items.length) return;
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <h3>${title}</h3>
    <button class="row-nav prev" aria-label="Scroll left">
      <svg viewBox="0 0 24 24"><path d="M15.5 19L8.5 12l7-7 1.4 1.4L11.3 12l5.6 5.6z"/></svg>
    </button>
    <div class="row-track">${items.map(cardHtml).join('')}</div>
    <button class="row-nav next" aria-label="Scroll right">
      <svg viewBox="0 0 24 24"><path d="M8.5 5l7 7-7 7-1.4-1.4L12.7 12 7.1 6.4z"/></svg>
    </button>`;
  contentEl.appendChild(row);
  wireRowNav(row);
}

function wireRowNav(row) {
  const track = row.querySelector('.row-track');
  const prev = row.querySelector('.row-nav.prev');
  const next = row.querySelector('.row-nav.next');
  if (!track || !prev || !next) return;
  prev.onclick = () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior: 'smooth' });
  next.onclick = () => track.scrollBy({ left: track.clientWidth * 0.85, behavior: 'smooth' });
}

function renderGrid(title, items) {
  if (!items || !items.length) {
    contentEl.innerHTML = '<div class="no-results">No results found. Try a different search.</div>';
    return;
  }
  contentEl.innerHTML = `<div class="search-header">Results for "${title}"</div>
    <div class="grid">${items.map(cardHtml).join('')}</div>`;
}

// ─── Search ───
function search(query) {
  heroEl.className = '';
  heroEl.innerHTML = '';
  heroEl.style.backgroundImage = '';
  genreBar.classList.add('hidden');
  clearSkeletons();
  contentEl.innerHTML = '<div class="skeleton-row" data-skeleton="1"><div class="skeleton skeleton-shimmer" style="width:200px;height:22px;margin-bottom:14px"></div><div class="skeleton-cards">' + Array(7).fill('<div class="skeleton skeleton-shimmer card-skeleton"></div>').join('') + '</div></div>';

  safeFetch(`/api/v1/search?query=${encodeURIComponent(query)}&t=all&limit=40&suggest=1`).then(data => {
    clearSkeletons();
    renderGrid(query, data && data.series ? data.series : []);
  }).catch(() => {
    clearSkeletons();
    showToast('Search failed. Please try again.');
  });
}

function resetToHome() {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
  genreBar.classList.remove('hidden');
  contentEl.innerHTML = '';
  loadHome();
}

// ─── Search Events ───
document.getElementById('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (q) search(q); else resetToHome();
});
searchInput.addEventListener('input', () => {
  searchClear.classList.toggle('visible', searchInput.value.length > 0);
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  resetToHome();
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

// ─── Load Home ───
async function loadHome() {
  showHeroSkeleton();
  showRowSkeletons(4);

  // Popular — hero + first row
  const popular = await safeFetch('/api/v1/videos/popular?slider=1&limit=20');
  if (popular && popular.length) {
    initHero(popular);
    addRow('Popular Now', popular);
  } else {
    heroEl.className = '';
    heroEl.innerHTML = '';
    showToast('Failed to load popular titles.');
  }
  clearSkeletons();

  // Try additional rows in parallel
  const extras = [
    { url: '/api/v1/videos/recent?limit=20', label: 'Recently Added' },
    { url: '/api/v1/videos/trending?limit=20', label: 'Trending Now' },
  ];
  extras.forEach(({ url, label }) => {
    safeFetch(url).then(data => {
      if (data && data.length) addRow(label, data);
    });
  });

  // Genre sample rows (load 2-3 in background)
  const sampleGenres = ['Action', 'Romance', 'Fantasy'];
  sampleGenres.forEach(genre => {
    safeFetch(`/api/v1/search?query=${encodeURIComponent(genre)}&t=series&limit=20`)
      .then(data => {
        if (data && data.series && data.series.length) addRow(genre, data.series);
      });
  });
}

// ─── Init ───
renderGenreBar();
loadHome();