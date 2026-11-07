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
      injectSettings();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  fixVideos();

  var PREF_KEY = 'qq-prefs';
  var RECOVERY_KEY = 'qq-recovery-every';
  var DOCK_OPTIONS = [20, 25, 30, 35, 40];
  var DOCK_DEFAULT = 30;
  var RECOVERY_OPTIONS = [0, 5, 10, 20];
  var RECOVERY_DEFAULT = 10;
  var prefs = { dock: DOCK_DEFAULT, recovery: RECOVERY_DEFAULT, ts: 0, dirty: false };
  var pushTimer = null;

  function validDock(value) {
    return DOCK_OPTIONS.indexOf(value) >= 0;
  }

  function validRecovery(value) {
    return RECOVERY_OPTIONS.indexOf(value) >= 0;
  }

  function saveLocalPrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
      localStorage.setItem(RECOVERY_KEY, String(prefs.recovery));
    } catch (error) {}
  }

  function loadLocalPrefs() {
    try {
      var stored = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      if (stored && typeof stored === 'object') {
        prefs = {
          dock: validDock(stored.dock) ? stored.dock : DOCK_DEFAULT,
          recovery: validRecovery(stored.recovery) ? stored.recovery : RECOVERY_DEFAULT,
          ts: typeof stored.ts === 'number' ? stored.ts : 0,
          dirty: stored.dirty === true,
        };
      }
    } catch (error) {}
  }

  function applyPrefs() {
    root.style.setProperty('--qq-dock', prefs.dock + 'dvh');
    try {
      localStorage.setItem(RECOVERY_KEY, String(prefs.recovery));
    } catch (error) {}
    Array.prototype.forEach.call(document.querySelectorAll('.qq-settings button'), function (button) {
      var field = button.getAttribute('data-field');
      var value = Number(button.getAttribute('data-value'));
      button.setAttribute('aria-pressed', String(prefs[field] === value));
    });
  }

  function pushPrefs() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sendPrefs, 1000);
  }

  function snapshot() {
    return JSON.stringify({ dock: prefs.dock, recovery: prefs.recovery });
  }

  function sendPrefs() {
    if (!prefs.dirty) return;
    var sent = snapshot();
    fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: sent,
      keepalive: true,
    })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data || typeof data.ts !== 'number' || snapshot() !== sent) return;
        prefs.ts = data.ts;
        prefs.dirty = false;
        saveLocalPrefs();
      })
      .catch(function () {});
  }

  function pullPrefs() {
    if (prefs.dirty) {
      pushPrefs();
      return;
    }
    fetch('/api/prefs', { cache: 'no-store' })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data || typeof data.ts !== 'number' || data.ts <= prefs.ts || prefs.dirty) return;
        if (!validDock(data.dock)) return;
        prefs = {
          dock: data.dock,
          recovery: validRecovery(data.recovery) ? data.recovery : prefs.recovery,
          ts: data.ts,
          dirty: false,
        };
        saveLocalPrefs();
        applyPrefs();
      })
      .catch(function () {});
  }

  function setPref(field, value) {
    prefs[field] = value;
    prefs.dirty = true;
    saveLocalPrefs();
    applyPrefs();
    pushPrefs();
  }

  function buildGroup(label, field, options, format) {
    var wrap = document.createElement('div');
    var title = document.createElement('div');
    title.textContent = label;
    var row = document.createElement('div');
    row.className = 'qq-settings-row';
    options.forEach(function (value) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'qsp-button';
      button.setAttribute('data-field', field);
      button.setAttribute('data-value', String(value));
      button.textContent = format(value);
      button.addEventListener('click', function () {
        setPref(field, value);
      });
      row.appendChild(button);
    });
    wrap.appendChild(title);
    wrap.appendChild(row);
    return wrap;
  }

  function buildSettings() {
    var box = document.createElement('div');
    box.className = 'qq-settings';
    var title = document.createElement('h4');
    title.textContent = '모바일 설정';
    box.appendChild(title);
    box.appendChild(
      buildGroup('선택지 영역 높이 (세로 화면)', 'dock', DOCK_OPTIONS, function (value) {
        return value + '%';
      }),
    );
    box.appendChild(
      buildGroup('자동 복구 저장 (장면 수마다)', 'recovery', RECOVERY_OPTIONS, function (value) {
        return value === 0 ? '끔' : String(value);
      }),
    );
    var note = document.createElement('div');
    note.className = 'qq-settings-note';
    note.textContent =
      '로그인한 모든 기기에 동기화됩니다. 복구 저장은 이 기기에만 5칸을 돌려 쓰며, 불러오기 목록의 Recovery에 나옵니다.';
    box.appendChild(note);
    return box;
  }

  function injectSettings() {
    var slider = document.querySelector('.qsp-volume-root');
    var panel = slider && slider.closest('qsp-pause-screen-panel');
    if (!panel || panel.querySelector('.qq-settings')) return;
    panel.appendChild(buildSettings());
    applyPrefs();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && prefs.dirty) {
      clearTimeout(pushTimer);
      sendPrefs();
    }
  });

  loadLocalPrefs();
  saveLocalPrefs();
  applyPrefs();
  pullPrefs();

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
