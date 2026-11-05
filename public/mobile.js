(function () {
  var TABS = [
    ['main', '본문'],
    ['vars', '변수'],
    ['inv', '인벤토리'],
    ['menu', '메뉴'],
  ];
  var root = document.documentElement;
  var query = window.matchMedia('(pointer: coarse) and (orientation: portrait)');
  var bar = null;

  function setTab(id) {
    root.setAttribute('data-qtab', id);
    if (!bar) return;
    Array.prototype.forEach.call(bar.children, function (button) {
      button.classList.toggle('active', button.getAttribute('data-tab') === id);
    });
  }

  function openMenu() {
    var button = document.querySelector('.qsp-touch-pause-button button');
    if (button) {
      button.click();
      return;
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }

  function build() {
    bar = document.createElement('div');
    bar.className = 'qq-tabbar';
    TABS.forEach(function (tab) {
      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-tab', tab[0]);
      button.textContent = tab[1];
      button.addEventListener('click', function () {
        if (tab[0] === 'menu') openMenu();
        else setTab(tab[0]);
      });
      bar.appendChild(button);
    });
    document.body.appendChild(bar);
    root.setAttribute('data-qtabs', '');
    setTab(root.getAttribute('data-qtab') || 'main');
  }

  function destroy() {
    bar.remove();
    bar = null;
    root.removeAttribute('data-qtabs');
  }

  function sync() {
    var wanted = Boolean(document.querySelector('qsp-cl')) && query.matches;
    if (wanted && !bar) build();
    else if (!wanted && bar) destroy();
  }

  new MutationObserver(sync).observe(document.documentElement, { childList: true, subtree: true });
  if (query.addEventListener) query.addEventListener('change', sync);
  sync();

  function pad(value) {
    return String(value).length < 2 ? '0' + value : String(value);
  }

  function showBuild() {
    fetch(location.origin + '/api/ping', { cache: 'no-store', redirect: 'manual' })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data || !data.version || !data.version.timestamp) return;
        var time = new Date(data.version.timestamp);
        var text =
          '배포 ' +
          pad(time.getMonth() + 1) +
          '/' +
          pad(time.getDate()) +
          ' ' +
          pad(time.getHours()) +
          ':' +
          pad(time.getMinutes()) +
          ' · ' +
          String(data.version.id).slice(0, 7);
        root.style.setProperty('--qbuild', JSON.stringify(text));
      })
      .catch(function () {});
  }

  showBuild();
})();

