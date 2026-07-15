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
            <div class="row-track">${items.map(cardHtml).join('')}</div>
        </div>`;
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
