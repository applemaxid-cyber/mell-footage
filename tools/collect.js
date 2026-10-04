// Откройте https://www.tiktok.com/@footage_me1 в браузере (лучше залогиниться),
// нажмите F12 -> Console, вставьте весь этот код и Enter.
// Скрипт сам прокрутит страницу до конца и скачает файл tiktok_export.json.
(async () => {
  const found = new Map();
  const grab = () => document.querySelectorAll('a[href*="/video/"]').forEach(a => {
    const m = a.href.match(/\/video\/(\d+)/); if (!m) return;
    const item = a.closest('[data-e2e="user-post-item"]') || a.parentElement;
    const img = item.querySelector('img');
    const views = item.querySelector('[data-e2e="video-views"]');
    found.set(m[1], {
      id: m[1],
      description: (img && img.alt) || a.title || '',
      views: views ? views.textContent.trim() : '',
      thumb: img ? img.src : ''
    });
  });
  let same = 0, last = 0;
  while (same < 8) {            // 8 прокруток подряд без новых видео = конец
    grab(); window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 1500));
    grab(); same = found.size === last ? same + 1 : 0; last = found.size;
    console.log('Собрано видео:', found.size);
  }
  const blob = new Blob([JSON.stringify([...found.values()], null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'tiktok_export.json'; a.click();
  console.log('Готово! Файл tiktok_export.json скачан, видео:', found.size);
})();
