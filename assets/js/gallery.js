(function () {
  'use strict';
  const page = document.querySelector('.memory-page');
  if (!page) return;
  const kind = page.dataset.memoryKind;
  const api = (page.dataset.galleryApi || '').replace(/\/$/, '');
  const grid = page.querySelector('[data-memory-grid]');
  const empty = page.querySelector('[data-memory-empty]');
  const search = page.querySelector('#memory-search');
  const dialog = document.querySelector('[data-memory-dialog]');
  const form = dialog.querySelector('form');
  const preview = dialog.querySelector('[data-memory-preview]');
  const status = dialog.querySelector('[data-memory-status]');
  const keyField = dialog.querySelector('[data-memory-key-field]');
  let currentUrl = '';
  let lastFocus = null;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('x-gx-h-memories', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('items', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function transact(mode, action) {
    return openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction('items', mode);
      const req = action(tx.objectStore('items'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    }));
  }
  function filter() {
    const term = search.value.trim().toLowerCase();
    let shown = 0;
    grid.querySelectorAll('[data-memory-card]').forEach(card => {
      card.hidden = !!term && !(card.dataset.search || '').toLowerCase().includes(term);
      if (!card.hidden) shown++;
    });
    empty.hidden = shown !== 0;
  }
  function card(item, local) {
    const article = document.createElement('article');
    article.className = 'memory-card' + (local ? ' memory-card--draft' : '');
    article.dataset.memoryCard = '';
    article.dataset.search = [item.title, item.location, item.caption, item.story].join(' ');
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = item.title;
    img.loading = 'lazy';
    const figcaption = document.createElement('figcaption');
    figcaption.textContent = item.caption;
    figure.append(img, figcaption);
    const body = document.createElement('div');
    body.className = 'memory-card__body';
    const meta = document.createElement('p');
    meta.className = 'memory-card__meta';
    meta.textContent = (local ? '本设备草稿' : new Date(item.created_at || Date.now()).toLocaleDateString('zh-CN')) + (item.location ? ' · ' + item.location : '');
    const title = document.createElement('h2');
    title.textContent = item.title;
    const story = document.createElement('div');
    story.className = 'memory-card__story';
    story.textContent = item.story || '';
    body.append(meta, title, story);
    if (kind === 'food' && item.location) {
      const link = document.createElement('a');
      link.className = 'memory-place-link';
      link.href = (document.body.dataset.baseurl || '') + '/travels/?q=' + encodeURIComponent(item.location);
      link.textContent = '在旅行地图找到这里 →';
      body.append(link);
    }
    const button = document.createElement('button');
    button.className = 'memory-delete';
    button.type = 'button';
    button.textContent = local ? '删除本地草稿' : '站主删除';
    button.addEventListener('click', async () => {
      if (!confirm(`删除「${item.title}」？`)) return;
      if (local) {
        await transact('readwrite', store => store.delete(item.id));
      } else {
        const key = prompt('请输入站主上传密钥');
        if (!key) return;
        try {
          const response = await fetch(api + '/items/' + item.id, { method: 'DELETE', headers: { authorization: 'Bearer ' + key } });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || '删除失败');
        } catch (error) { alert(error.message); return; }
      }
      article.remove();
      filter();
    });
    body.append(button);
    if (local) {
      const badge = document.createElement('span');
      badge.className = 'memory-draft-badge';
      badge.textContent = '本设备草稿';
      article.append(badge);
    }
    article.append(figure, body);
    return article;
  }
  async function loadDrafts() {
    try {
      const items = await transact('readonly', store => store.getAll());
      items.filter(item => item.kind === kind).sort((a, b) => a.created - b.created).forEach(item => grid.prepend(card(item, true)));
      filter();
    } catch (_) { /* Local drafts are optional. */ }
  }
  async function loadCloud() {
    try {
      const response = await fetch(api + '/items?kind=' + encodeURIComponent(kind), { cache: 'no-store' });
      if (!response.ok) throw new Error('云端暂时无法读取');
      const result = await response.json();
      result.items.slice().reverse().forEach(item => grid.prepend(card(item, false)));
      filter();
    } catch (_) {
      page.querySelector('[data-memory-note]').textContent = '云端内容暂时无法读取，请稍后刷新页面。';
    }
  }
  function close() {
    dialog.hidden = true;
    document.body.style.overflow = '';
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = '';
    form.reset();
    preview.textContent = '图片预览';
    status.textContent = '';
    lastFocus?.focus();
  }
  page.querySelector('[data-memory-open]').addEventListener('click', event => {
    lastFocus = event.currentTarget;
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    form.image.focus();
  });
  dialog.querySelector('[data-memory-close]').addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !dialog.hidden) close(); });
  form.image.addEventListener('change', () => {
    const file = form.image.files[0];
    if (!file) return;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(file);
    preview.textContent = '';
    const img = document.createElement('img');
    img.src = currentUrl;
    img.alt = '待上传图片预览';
    preview.append(img);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const file = form.image.files[0];
    if (!file) return;
    const item = { id: crypto.randomUUID(), kind, title: form.title.value.trim(), location: form.location.value.trim(), caption: form.caption.value.trim(), story: form.story.value.trim(), created: Date.now() };
    if (api) {
      if (file.size > 8 * 1024 * 1024) { status.textContent = '图片不能超过 8 MB。'; return; }
      const key = form.upload_key.value.trim();
      if (!key) { status.textContent = '请填写站主上传密钥。'; return; }
      const data = new FormData();
      for (const field of ['kind', 'title', 'location', 'caption', 'story']) data.set(field, item[field]);
      data.set('image', file);
      status.textContent = '正在上传到云端……';
      try {
        const response = await fetch(api + '/items', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: data });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '上传失败');
        grid.prepend(card(result, false));
        status.textContent = '已公开，其他人刷新页面即可看到。';
        filter();
        setTimeout(close, 1100);
      } catch (error) { status.textContent = error.message || '上传失败，请稍后再试。'; }
    } else {
      status.textContent = '正在保存本设备草稿……';
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          item.image = reader.result;
          await transact('readwrite', store => store.put(item));
          grid.prepend(card(item, true));
          filter();
          status.textContent = '已保存到这台设备。';
          setTimeout(close, 650);
        } catch (_) { status.textContent = '保存失败，图片可能太大。'; }
      };
      reader.readAsDataURL(file);
    }
  });
  search.addEventListener('input', filter);
  const city = new URLSearchParams(location.search).get('city');
  if (city) search.value = city;
  if (api) {
    keyField.hidden = false;
    dialog.querySelector('[data-memory-mode]').textContent = 'CLOUD UPLOAD';
    dialog.querySelector('[data-memory-submit]').textContent = '上传并公开';
    page.querySelector('[data-memory-note]').textContent = '云端照片会公开显示给所有访客。旧的本设备草稿仍只在这台设备上显示。';
    page.querySelector('[data-memory-help]').innerHTML = '<strong>公开照片</strong><p>站主点击“添加照片与配字”，填写上传密钥后即可发布。所有访客刷新页面都能看到；旧的本地草稿不会自动上传。</p>';
    loadCloud();
  }
  loadDrafts();
})();
