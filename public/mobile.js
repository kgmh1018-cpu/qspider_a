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
        if (tab[0] === 'menu') {
          setTab('main');
          openMenu();
        } else setTab(tab[0]);
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

  var viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && viewport.content.indexOf('viewport-fit') < 0) {
    viewport.content += ', viewport-fit=cover';
  }

  function fixVideos() {
    Array.prototype.forEach.call(document.querySelectorAll('video:not([data-qv])'), function (video) {
      video.setAttribute('data-qv', '1');
      video.muted = true;
      video.defaultMuted = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      if (video.autoplay && video.paused) {
        var started = video.play();
        if (started && started.catch) started.catch(function () {});
      }
    });
  }

  var videoQueued = false;
  new MutationObserver(function () {
    if (videoQueued) return;
    videoQueued = true;
    requestAnimationFrame(function () {
      videoQueued = false;
      fixVideos();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  fixVideos();

  var viewer = null;

  function closeViewer() {
    if (!viewer) return;
    viewer.remove();
    viewer = null;
  }

  function openViewer(source) {
    closeViewer();
    var media;
    if (source.tagName === 'VIDEO') {
      media = source.cloneNode(true);
      media.setAttribute('data-qv', '1');
      media.removeAttribute('style');
      media.controls = true;
      media.muted = false;
      media.defaultMuted = false;
      media.removeAttribute('muted');
      media.setAttribute('playsinline', '');
    } else {
      media = document.createElement('img');
      media.src = source.currentSrc || source.src;
    }
    media.className = 'qq-viewer-media';
    viewer = document.createElement('div');
    viewer.className = 'qq-viewer';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'qq-viewer-close';
    close.textContent = '✕';
    viewer.appendChild(media);
    viewer.appendChild(close);
    viewer.addEventListener('click', function (event) {
      if (event.target !== media || media.tagName === 'IMG') closeViewer();
    });
    document.body.appendChild(viewer);
    if (media.tagName === 'VIDEO') {
      var started = media.play();
      if (started && started.catch) started.catch(function () {});
    }
  }

  document.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      if (!target || !target.closest || viewer) return;
      var media = target.closest('img, video');
      if (!media || !media.closest('qsp-main-content')) return;
      if (media.closest('a, button, label, [onclick], [role="button"], [tabindex]')) return;
      if (media.tagName === 'IMG' && media.naturalWidth < 100) return;
      openViewer(media);
    },
    true,
  );
})();

