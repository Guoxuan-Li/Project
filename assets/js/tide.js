(() => {
  const button = document.querySelector('.tide-cat-button');
  const reply = document.querySelector('.tide-cat-reply');
  let timer, index = 0;
  const words = ['喵～ 很高兴见到你。', '呼噜呼噜……', '今天也一起去看看世界吧。'];
  button?.addEventListener('click', () => {
    reply.textContent = words[index++ % words.length];
    reply.classList.add('is-visible');
    clearTimeout(timer);
    timer = setTimeout(() => reply.classList.remove('is-visible'), 3500);
  });
  const menuButton = document.querySelector('.site-nav__toggle');
  const list = document.querySelector('.site-nav__list');
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
      menuButton.setAttribute('aria-expanded', 'false');
      list.classList.remove('is-open');
      menuButton.focus();
    }
  });
})();
