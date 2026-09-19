(function () {
  'use strict';
  var section = document.querySelector('[data-guestbook-api].guestbook-notes');
  var form = document.getElementById('guestbook-form');
  var list = document.getElementById('guestbook-list');
  var reload = document.getElementById('guestbook-reload');
  var formStatus = document.getElementById('guestbook-form-status');
  if (!section || !form || !list || !reload) return;
  var api = (section.dataset.guestbookApi || '').replace(/\/$/, '');
  var ownerKeyName = 'x-gx-h-owner-key';
  function savedOwnerKey() { try { return localStorage.getItem(ownerKeyName) || ''; } catch (_) { return ''; } }

  function status(message) {
    list.replaceChildren();
    var note = document.createElement('p');
    note.className = 'guestbook-status';
    note.textContent = message;
    list.appendChild(note);
  }

  function card(comment) {
    var article = document.createElement('article');
    article.className = 'guestbook-card';
    var header = document.createElement('div');
    header.className = 'guestbook-card__header';
    var avatar = document.createElement('span');
    avatar.className = 'guestbook-card__avatar guestbook-card__avatar--letter';
    avatar.textContent = (comment.name || '访').slice(0, 1);
    var identity = document.createElement('div');
    var name = document.createElement('strong');
    name.textContent = comment.name || '访客';
    var time = document.createElement('time');
    time.dateTime = comment.created_at || '';
    time.textContent = comment.created_at ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(String(comment.created_at).replace(' ', 'T') + 'Z')) : '';
    identity.append(name, time);
    header.append(avatar, identity);
    var body = document.createElement('p');
    body.className = 'guestbook-card__body';
    body.textContent = comment.content || '';
    var remove = document.createElement('button');
    remove.className = 'guestbook-delete';
    remove.type = 'button';
    remove.textContent = '站主删除';
    remove.addEventListener('click', async function () {
      if (!confirm('删除这条留言？')) return;
      var key = savedOwnerKey() || prompt('请输入站主密钥');
      if (!key) return;
      try {
        var response = await fetch(api + '/comments/' + comment.id, { method: 'DELETE', headers: { authorization: 'Bearer ' + key } });
        var result = await response.json();
        if (!response.ok) throw new Error(result.error || '删除失败');
        article.remove();
      } catch (error) { alert(error.message); }
    });
    article.append(header, body, remove);
    return article;
  }

  async function load() {
    if (!api) { status('云端留言板尚未连接。'); form.querySelector('button').disabled = true; return; }
    reload.disabled = true;
    list.setAttribute('aria-busy', 'true');
    status('正在读取留言…');
    try {
      var response = await fetch(api + '/comments', { cache: 'no-store' });
      if (!response.ok) throw new Error('读取失败');
      var result = await response.json();
      list.replaceChildren();
      if (!result.comments.length) status('还没有留言。欢迎留下第一句话！');
      else result.comments.forEach(function (comment) { list.appendChild(card(comment)); });
    } catch (_) { status('暂时读取不到留言，请稍后刷新。'); }
    finally { list.setAttribute('aria-busy', 'false'); reload.disabled = false; }
  }

  try { form.name.value = localStorage.getItem('x-gx-h-guest-name') || ''; } catch (_) {}
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!api) return;
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    formStatus.textContent = '正在送出……';
    try {
      var response = await fetch(api + '/comments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.name.value.trim(), content: form.content.value.trim(), website: form.website.value })
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || '留言失败');
      try { localStorage.setItem('x-gx-h-guest-name', form.name.value.trim()); } catch (_) {}
      form.content.value = '';
      formStatus.textContent = '留言已公开。';
      await load();
    } catch (error) { formStatus.textContent = error.message || '留言失败，请稍后再试。'; }
    finally { button.disabled = false; }
  });
  reload.addEventListener('click', load);
  load();
})();
