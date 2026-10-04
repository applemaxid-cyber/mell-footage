(() => {
  const PAGE = 40;
  const $ = id => document.getElementById(id);
  let all = [], shown = PAGE, activeTag = null;

  // Нормализация: регистр, ё→е, без знаков препинания
  const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}#\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0);

  function prepare(v) {
    v.tags = [...new Set([...(v.hashtags || []), ...(v.tags || [])].map(t => norm(t).replace(/^#/, '')).filter(Boolean))];
    v._hay = norm([v.description, v.title, (v.tags || []).join(' '), (v.hashtags || []).join(' ')].join(' '));
    return v;
  }

  function highlight(text, words) {
    let out = esc(text);
    for (const w of words) if (w.length > 1) out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    return out;
  }

  function filtered() {
    const words = norm($('q').value).split(' ').filter(Boolean);
    let list = all.filter(v => words.every(w => v._hay.includes(w)) && (!activeTag || v.tags.includes(activeTag)));
    const s = $('sort').value;
    const by = {
      new: (a, b) => (b.date || '').localeCompare(a.date || ''),
      old: (a, b) => (a.date || '').localeCompare(b.date || ''),
      views: (a, b) => (b.views || 0) - (a.views || 0),
      likes: (a, b) => (b.likes || 0) - (a.likes || 0)
    };
    return { list: list.sort(by[s]), words };
  }

  function render() {
    const { list, words } = filtered();
    $('count').textContent = list.length ? `Найдено: ${list.length}` : '';
    $('grid').innerHTML = list.slice(0, shown).map(v => `
      <button class="card" data-id="${v.id}">
        <div class="thumb" style="background-image:url('${esc(v.thumb || '')}')"></div>
        <div class="body"><p class="title">${highlight(v.description || 'Без описания', words)}</p>
        <div class="meta">${v.views ? '👁 ' + fmt(v.views) : ''} ${v.likes ? '❤ ' + fmt(v.likes) : ''} ${v.date ? '· ' + v.date : ''}</div></div>
      </button>`).join('');
    $('more').hidden = list.length <= shown;
    const e = $('empty');
    e.hidden = list.length > 0;
    if (!list.length) e.textContent = all.length ? 'Ничего не найдено.\nПопробуйте другое слово или сбросьте тег.' : 'Пока нет ни одного футажа.\nДобавьте ссылки в links.txt и запустите scripts/sync.py (см. README).';
  }

  function renderTags() {
    const cnt = {};
    all.forEach(v => v.tags.forEach(t => cnt[t] = (cnt[t] || 0) + 1));
    // слишком общие теги (есть почти у всех видео) в фильтрах бесполезны
    const top = Object.entries(cnt).filter(([, n]) => n < all.length * 0.5).sort((a, b) => b[1] - a[1]).slice(0, 30);
    $('tags').innerHTML = top.map(([t, n]) => `<button class="chip${t === activeTag ? ' on' : ''}" data-tag="${esc(t)}">#${esc(t)} <small>${n}</small></button>`).join('');
  }

  function open(id) {
    const v = all.find(x => x.id === id);
    if (!v) return;
    $('player').src = 'https://www.tiktok.com/embed/v2/' + id;
    $('mtext').textContent = v.description || '';
    $('mlink').href = v.url || 'https://www.tiktok.com/@footage_me1/video/' + id;
    $('modal').hidden = false;
    history.replaceState(null, '', '#' + id);
  }
  function close() { $('modal').hidden = true; $('player').src = 'about:blank'; history.replaceState(null, '', location.pathname + location.search); }

  let t;
  $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { shown = PAGE; render(); }, 120); });
  $('sort').addEventListener('change', () => { shown = PAGE; render(); });
  $('more').addEventListener('click', () => { shown += PAGE; render(); });
  $('grid').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) open(c.dataset.id); });
  $('tags').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    activeTag = activeTag === c.dataset.tag ? null : c.dataset.tag;
    shown = PAGE; renderTags(); render();
  });
  $('close').addEventListener('click', close);
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) close(); });

  fetch('data/videos.json').then(r => r.json()).then(d => {
    all = d.map(prepare);
    renderTags(); render();
    const id = location.hash.slice(1); if (id) open(id);
  }).catch(() => { $('empty').hidden = false; $('empty').textContent = 'Не удалось загрузить data/videos.json. Откройте сайт через веб-сервер (python3 -m http.server).'; });
})();
