const params = new URLSearchParams(location.search);
const seriesId = params.get('id');
const episodesDiv = document.getElementById('episodes');
const seasonsDiv = document.getElementById('seasons');

function poster(item) {
    return item.image || (item.images && item.images[0] && item.images[0].url) || '';
}

async function loadEpisodes(seasonId) {
    episodesDiv.innerHTML = 'Loading episodes...';
    const res = await fetch(`/api/v1/season/${seasonId}/episodes?page=1&limit=20&order_by=asc`);
    const episodes = await res.json();
    episodesDiv.innerHTML = '';
    episodes.forEach((ep) => {
        const row = document.createElement('div');
        row.className = 'ep-row';
        row.innerHTML = `<img loading="lazy" src="${ep.image}" alt=""><div class="ep-title">${ep.episode}. ${ep.title}</div>`;
        row.onclick = () => location.href = `/watch.html?ep=${ep.content_id}`;
        episodesDiv.appendChild(row);
    });
}

async function init() {
    const res = await fetch(`/api/v1/series/${seriesId}`);
    const series = await res.json();
    document.getElementById('seriesTitle').textContent = series.title;
    document.getElementById('seriesDesc').textContent = series.description || '';
    document.getElementById('seriesHero').style.backgroundImage = `url(${poster(series)})`;

    seasonsDiv.innerHTML = '';
    (series.seasons || []).forEach((season, i) => {
        const btn = document.createElement('button');
        btn.textContent = season.title;
        btn.className = i === 0 ? 'active' : '';
        btn.onclick = () => {
            [...seasonsDiv.children].forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            loadEpisodes(season.content_id);
        };
        seasonsDiv.appendChild(btn);
    });
    if (series.seasons && series.seasons.length) loadEpisodes(series.seasons[0].content_id);
}

init();
