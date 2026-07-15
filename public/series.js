const params = new URLSearchParams(location.search);
const seriesId = params.get('id');
const episodesDiv = document.getElementById('episodes');
const seasonsSelect = document.getElementById('seasons');
let currentSeasons = [];

function backdrop(item) {
    const wide = item.images && item.images.find((i) => i.type === 'poster_wide');
    return (wide && wide.url) || item.image || (item.images && item.images[0] && item.images[0].url) || '';
}

function fmtDuration(ms) {
    const min = Math.round(ms / 60000);
    return `${min}m`;
}

async function loadEpisodes(seasonId) {
    episodesDiv.innerHTML = '';
    const res = await fetch(`/api/v1/season/${seasonId}/episodes?page=1&limit=20&order_by=asc`);
    const episodes = await res.json();
    episodesDiv.innerHTML = '';
    episodes.forEach((ep) => {
        const row = document.createElement('div');
        row.className = 'ep-row';
        row.innerHTML = `
            <div class="ep-number">${ep.episode}</div>
            <div class="ep-thumb">
                <img loading="lazy" src="${ep.image}" alt="">
                <div class="ep-play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                ${ep.duration_ms ? `<span class="ep-duration">${fmtDuration(ep.duration_ms)}</span>` : ''}
            </div>
            <div class="ep-info">
                <p class="ep-title">${ep.title}</p>
                ${ep.duration_ms ? `<p class="ep-duration-text">${fmtDuration(ep.duration_ms)}</p>` : ''}
            </div>`;
        row.onclick = () => location.href = `/watch.html?ep=${ep.content_id}`;
        episodesDiv.appendChild(row);
    });
    if (episodes.length) document.getElementById('heroPlayBtn').onclick = () => location.href = `/watch.html?ep=${episodes[0].content_id}`;
}

async function init() {
    const res = await fetch(`/api/v1/series/${seriesId}`);
    const series = await res.json();
    document.getElementById('seriesTitle').textContent = series.title;
    document.getElementById('seriesDesc').textContent = series.description || '';
    document.getElementById('seriesHero').style.backgroundImage = `url(${backdrop(series)})`;

    currentSeasons = series.seasons || [];
    const totalEps = currentSeasons.reduce((sum, s) => sum + (s.episode_count || 0), 0);
    document.getElementById('seriesMeta').innerHTML = `
        <span class="badge">HD</span>
        <span>${currentSeasons.length} Season${currentSeasons.length === 1 ? '' : 's'}</span>
        <span>&middot;</span>
        <span>${totalEps} Episodes</span>`;

    seasonsSelect.innerHTML = currentSeasons.map((s) => `<option value="${s.content_id}">${s.title}</option>`).join('');
    seasonsSelect.onchange = () => loadEpisodes(seasonsSelect.value);
    if (currentSeasons.length) loadEpisodes(currentSeasons[0].content_id);
}

init();
