(function () {
  var DB = 'taraz-key';
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function get(k) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var q = d.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { res(undefined); };
      });
    });
  }
  function put(k, v) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('kv', 'readwrite');
        t.objectStore('kv').put(v, k);
        t.oncomplete = function () { res(); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  var b64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  var sw = navigator.serviceWorker;
  var hadController = !!sw.controller;
  var booted = false;
  // a newer version took over while this page was starting: start again with it (once)
  sw.addEventListener('controllerchange', function () {
    if (hadController && !booted && !sessionStorage.getItem('taraz-reloaded')) { sessionStorage.setItem('taraz-reloaded', '1'); location.reload(); }
  });
  var ready = sw.register('./sw.js', { scope: './' }).then(function () { return sw.ready; }).then(function () {
    if (sw.controller) return;
    return new Promise(function (res) { sw.addEventListener('controllerchange', res, { once: true }); setTimeout(res, 6000); });
  });
  function fail() {
    var g = document.getElementById('gate');
    if (g) { g.hidden = false; var e = document.getElementById('err'); e.textContent = 'این مرورگر برنامه را باز نکرد. صفحه را یک بار ببندید و دوباره باز کنید.'; e.hidden = false; }
  }
  function boot() {
    return ready.then(function () {
      if (!sw.controller) {
        if (!sessionStorage.getItem('taraz-reloaded')) { sessionStorage.setItem('taraz-reloaded', '1'); location.reload(); } else fail();
        return;
      }
      booted = true;
      sessionStorage.removeItem('taraz-reloaded');
      return fetch('./k.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (cfg) {
        document.getElementById('gate').remove();
        // the sign-in page styles the body inline; hand the page over to the app's own styles and font
        document.body.removeAttribute('style');
        cfg.c.forEach(function (href) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = './' + href; document.head.appendChild(l); });
        var s = document.createElement('script'); s.type = 'module'; s.src = './' + cfg.e; document.body.appendChild(s);
      });
    });
  }
  function show() {
    var f = document.getElementById('gate');
    f.hidden = false;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var user = f.u.value.trim().toLowerCase(), pass = f.p.value.trim();
      var btn = f.querySelector('button'); btn.disabled = true; btn.textContent = '...';
      document.getElementById('err').hidden = true;
      fetch('./k.json').then(function (r) { return r.json(); }).then(function (cfg) {
        var acc = cfg.u[user];
        if (!acc) throw new Error('no');
        var box = b64(acc.b);
        return crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
          .then(function (base) { return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(acc.s), iterations: cfg.i }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
          .then(function (kek) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: box.slice(0, 12) }, kek, box.slice(12)); })
          .then(function (plain) {
            var o = JSON.parse(new TextDecoder().decode(plain));
            return put('key', o.k).then(function () { return put('session', { user: user, role: o.role, name: o.name }); });
          });
      }).then(boot).catch(function () {
        btn.disabled = false; btn.textContent = 'ورود'; f.p.value = '';
        document.getElementById('err').hidden = false;
      });
    });
  }
  get('key').then(function (k) { if (k) boot(); else show(); }, show);
})();
