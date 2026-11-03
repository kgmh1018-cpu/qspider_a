(function () {
  var DB_NAME = 'QspiderDatabase';
  var FORMAT = 'qspider-saves';

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var chunk = 0x8000;
    var parts = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(parts.join(''));
  }

  function fromBase64(text) {
    var binary = atob(text);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function dbExists() {
    if (!indexedDB.databases) return Promise.resolve(true);
    return indexedDB.databases().then(function (list) {
      return list.some(function (item) {
        return item.name === DB_NAME;
      });
    });
  }

  function openDb() {
    return dbExists().then(function (exists) {
      if (!exists) return null;
      return new Promise(function (resolve, reject) {
        var request = indexedDB.open(DB_NAME);
        request.onupgradeneeded = function () {
          request.transaction.abort();
        };
        request.onsuccess = function () {
          resolve(request.result);
        };
        request.onerror = function () {
          if (request.error && request.error.name === 'AbortError') resolve(null);
          else reject(request.error);
        };
      });
    });
  }

  function readAll() {
    return openDb().then(function (db) {
      if (!db) return { games: [] };
      if (!db.objectStoreNames.contains('gameSaves') || !db.objectStoreNames.contains('games')) {
        db.close();
        return { games: [] };
      }
      var tx = db.transaction(['gameSaves', 'games'], 'readonly');
      return Promise.all([wrap(tx.objectStore('gameSaves').getAll()), wrap(tx.objectStore('games').getAll())]).then(
        function (result) {
          db.close();
          var titles = {};
          result[1].forEach(function (game) {
            titles[game.id] = game.title;
          });
          var byGame = {};
          result[0].forEach(function (record) {
            if (!byGame[record.game_id]) byGame[record.game_id] = [];
            byGame[record.game_id].push({
              key: record.key,
              slot: record.slot,
              timestamp: record.timestamp,
              data: toBase64(record.data),
            });
          });
          return {
            games: Object.keys(byGame).map(function (id) {
              return { game_id: id, title: titles[id] || '', saves: byGame[id] };
            }),
          };
        },
      );
    });
  }

  function validate(payload) {
    if (!payload || payload.format !== FORMAT || !Array.isArray(payload.games)) {
      throw new Error('세이브 백업 파일이 아닙니다');
    }
    payload.games.forEach(function (game) {
      if (typeof game.game_id !== 'string' || !Array.isArray(game.saves)) throw new Error('파일 형식이 올바르지 않습니다');
      game.saves.forEach(function (save) {
        if (typeof save.key !== 'string' || typeof save.slot !== 'number' || typeof save.data !== 'string') {
          throw new Error('파일 형식이 올바르지 않습니다');
        }
      });
    });
  }

  function writeAll(payload) {
    validate(payload);
    var items = [];
    payload.games.forEach(function (game) {
      game.saves.forEach(function (save) {
        items.push({ game_id: game.game_id, save: save });
      });
    });
    return openDb().then(function (db) {
      if (!db) throw new Error('게임을 한 번 먼저 열어 주세요');
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('gameSaves', 'readwrite');
        var store = tx.objectStore('gameSaves');
        var index = store.index('[game_id+key+slot]');
        items.forEach(function (item) {
          var lookup = index.getKey([item.game_id, item.save.key, item.save.slot]);
          lookup.onsuccess = function () {
            var record = {
              game_id: item.game_id,
              key: item.save.key,
              slot: item.save.slot,
              timestamp: item.save.timestamp,
              data: fromBase64(item.save.data),
            };
            if (lookup.result !== undefined) record.id = lookup.result;
            store.put(record);
          };
        });
        tx.oncomplete = function () {
          db.close();
          resolve(items.length);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error || new Error('저장에 실패했습니다'));
        };
      });
    });
  }

  function buildPayload(data) {
    return { format: FORMAT, version: 1, exported: new Date().toISOString(), games: data.games };
  }

  window.qqBackup = { readAll: readAll, writeAll: writeAll, buildPayload: buildPayload };

  if (typeof document === 'undefined') return;

  var STYLE =
    '.qq-backup-btn{position:fixed;top:6px;right:6px;z-index:1;width:36px;height:36px;border:0;border-radius:18px;' +
    'background:rgba(28,28,30,.65);color:#fff;font-size:18px;padding:0}' +
    '.qq-backup-sheet{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-end;background:rgba(0,0,0,.5)}' +
    '.qq-backup-panel{width:100%;box-sizing:border-box;padding:16px;background:#1c1c1e;color:#fff;font-family:sans-serif;' +
    'border-radius:16px 16px 0 0}' +
    '.qq-backup-panel h3{margin:0 0 8px;font-size:18px}' +
    '.qq-backup-panel p{margin:0 0 12px;font-size:14px;color:#c7c7cc;white-space:pre-wrap}' +
    '.qq-backup-panel button{display:block;width:100%;min-height:48px;margin-top:8px;border:0;border-radius:10px;' +
    'background:#3a3a3c;color:#fff;font-size:16px}' +
    '.qq-backup-panel button:disabled{opacity:.4}';

  function el(tag, text) {
    var node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function stamp() {
    var d = new Date();
    function two(n) {
      return (n < 10 ? '0' : '') + n;
    }
    return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes());
  }

  function openSheet() {
    var overlay = el('div');
    overlay.className = 'qq-backup-sheet';
    var panel = el('div');
    panel.className = 'qq-backup-panel';
    var status = el('p', '세이브를 확인하는 중…');
    var shareButton = el('button', '내보내기 (공유 / 파일에 저장)');
    var downloadButton = el('button', '내보내기 (다운로드)');
    var importButton = el('button', '파일에서 가져오기');
    var closeButton = el('button', '닫기');
    var input = el('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    shareButton.disabled = true;
    downloadButton.disabled = true;
    shareButton.style.display = 'none';

    panel.appendChild(el('h3', '세이브 백업'));
    panel.appendChild(status);
    panel.appendChild(shareButton);
    panel.appendChild(downloadButton);
    panel.appendChild(importButton);
    panel.appendChild(input);
    panel.appendChild(closeButton);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var file = null;

    function prepare() {
      return readAll().then(function (data) {
        var count = data.games.reduce(function (sum, game) {
          return sum + game.saves.length;
        }, 0);
        if (count === 0) {
          file = null;
          status.textContent = '이 기기에 저장된 세이브가 없습니다.';
          shareButton.disabled = true;
          downloadButton.disabled = true;
          return;
        }
        var text = JSON.stringify(buildPayload(data));
        file = new File([text], 'qspider-saves-' + stamp() + '.json', { type: 'application/json' });
        status.textContent = '게임 ' + data.games.length + '개, 세이브 ' + count + '개를 내보낼 수 있습니다.';
        downloadButton.disabled = false;
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          shareButton.style.display = 'block';
          shareButton.disabled = false;
        }
      });
    }

    prepare().catch(function (error) {
      status.textContent = '세이브를 읽지 못했습니다: ' + error.message;
    });

    shareButton.addEventListener('click', function () {
      if (!file) return;
      navigator.share({ files: [file], title: 'qSpider 세이브' }).catch(function (error) {
        if (error && error.name !== 'AbortError') status.textContent = '공유에 실패했습니다: ' + error.message;
      });
    });

    downloadButton.addEventListener('click', function () {
      if (!file) return;
      var url = URL.createObjectURL(file);
      var link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 10000);
    });

    importButton.addEventListener('click', function () {
      input.click();
    });

    input.addEventListener('change', function () {
      var chosen = input.files && input.files[0];
      if (!chosen) return;
      status.textContent = '가져오는 중…';
      chosen
        .text()
        .then(function (text) {
          return writeAll(JSON.parse(text));
        })
        .then(function (count) {
          status.textContent = '세이브 ' + count + '개를 가져왔습니다. 게임을 다시 열어 확인하세요.';
          input.value = '';
          return prepare();
        })
        .catch(function (error) {
          status.textContent = '가져오지 못했습니다: ' + error.message;
          input.value = '';
        });
    });

    closeButton.addEventListener('click', function () {
      overlay.remove();
    });
  }

  function init() {
    var style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);
    var button = el('button', '💾');
    button.className = 'qq-backup-btn';
    button.type = 'button';
    button.setAttribute('aria-label', '세이브 백업');
    button.addEventListener('click', openSheet);
    document.body.appendChild(button);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
