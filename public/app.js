const heroEl = document.getElementById('hero');
const contentEl = document.getElementById('content');

function poster(item) {
    return item.image || (item.images && item.images[0] && item.images[0].url) || '';
}

function renderHero(item) {
    heroEl.className = 'hero';
    heroEl.style.backgroundImage = `url(${poster(item)})`;
    heroEl.innerHTML = `
        <div class="hero-content">
            <h2>${item.title}</h2>
            <p>${item.description || ''}</p>
            <div class="hero-actions">
                <button class="btn-play" onclick="location.href='/series.html?id=${item.content_id}'">▶ View</button>
                <button class="btn-info" onclick="location.href='/series.html?id=${item.content_id}'">ⓘ More Info</button>
            </div>
        </div>`;
}

function cardHtml(item) {
    return `<div class="card" onclick="location.href='/series.html?id=${item.content_id}'">
        <img loading="lazy" src="${poster(item)}" alt="">
        <div class="title">${item.title}</div>
    </div>`;
}

function renderRow(title, items) {
    contentEl.innerHTML = `
        <div class="row">
            <h3>${title}</h3>
            <button class="row-nav prev" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="M15.5 19L8.5 12l7-7 1.4 1.4L11.3 12l5.6 5.6z"/></svg></button>
            <div class="row-track">${items.map(cardHtml).join('')}</div>
            <button class="row-nav next" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="M8.5 5l7 7-7 7-1.4-1.4L12.7 12 7.1 6.4z"/></svg></button>
        </div>`;
    wireRowNav();
}

function wireRowNav() {
    const track = contentEl.querySelector('.row-track');
    const prev = contentEl.querySelector('.row-nav.prev');
    const next = contentEl.querySelector('.row-nav.next');
    if (!track) return;
    prev.onclick = () => track.scrollBy({ left: -track.clientWidth * 0.9, behavior: 'smooth' });
    next.onclick = () => track.scrollBy({ left: track.clientWidth * 0.9, behavior: 'smooth' });
}

function renderGrid(title, items) {
    contentEl.innerHTML = `
        <div class="row">
            <h3>${title}</h3>
            <div class="grid">${items.map(cardHtml).join('')}</div>
        </div>`;
}

async function loadPopular() {
    const res = await fetch('/api/v1/videos/popular?slider=1&limit=20');
    const items = await res.json();
    if (items.length) renderHero(items[0]);
    renderRow('Popular', items.slice(1));
}

async function search(query) {
    heroEl.className = '';
    heroEl.innerHTML = '';
    const res = await fetch(`/api/v1/search?query=${encodeURIComponent(query)}&t=all&limit=20&suggest=1`);
    const data = await res.json();
    renderGrid(`Results for "${query}"`, data.series || []);
}

document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('searchInput').value.trim();
    if (q) search(q); else loadPopular();
});

window.addEventListener('scroll', () => {
    document.getElementById('siteHeader').classList.toggle('scrolled', window.scrollY > 10);
});

loadPopular();
