(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp;
  var inTelegram = !!(tg && tg.initData);          // initData is empty when opened in a normal browser
  var root = document.documentElement;
  var LIGHT_BG = "#faf8f6", DARK_BG = "#1d1817";

  // ---------- Telegram integration ----------
  function applyTheme() {
    var dark = inTelegram ? tg.colorScheme === "dark" : false;
    root.setAttribute("data-theme", dark ? "dark" : "light");
    if (inTelegram) {
      var bg = dark ? DARK_BG : LIGHT_BG;
      try {
        if (tg.isVersionAtLeast("6.1")) { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); }
        if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor(bg);
      } catch (e) { /* older clients */ }
    }
  }
  if (tg) {
    try { tg.ready(); tg.expand(); } catch (e) {}
    if (inTelegram) {
      root.classList.add("in-tg");
      tg.onEvent("themeChanged", applyTheme);
    }
  }
  applyTheme();

  function openTg(url) {
    if (inTelegram && tg.openTelegramLink) {
      try { tg.openTelegramLink(url); return; } catch (e) {}
    }
    var w = window.open(url, "_blank");
    if (w) { try { w.opener = null; } catch (e) {} } else { window.location.href = url; }
  }
  function haptic() {
    try { if (inTelegram && tg.HapticFeedback) tg.HapticFeedback.selectionChanged(); } catch (e) {}
  }

  // ---------- helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rub(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + "\u00a0₽"; }
  function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[\s\-–—.]/g, ""); }
  // Latin look-alikes typed instead of Cyrillic in articles (M-102 -> М-102)
  var LAT = { a: "а", b: "в", c: "с", e: "е", h: "н", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у" };
  function cyr(s) { return s.replace(/[abcehkmoptxy]/g, function (c) { return LAT[c]; }); }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- state ----------
  var data = null, byId = {};
  var state = { cat: "", size: 0, q: "" };

  function matches(it) {
    if (state.cat && it.category !== state.cat) return false;
    if (state.size && it.sizeNums.indexOf(state.size) < 0) return false;
    if (state.q) {
      var q = norm(state.q), hay = it._hay;
      if (hay.indexOf(q) < 0 && hay.indexOf(cyr(q)) < 0) return false;
    }
    return true;
  }

  function countFor(cat) {
    return data.items.filter(function (it) {
      if (cat && it.category !== cat) return false;
      if (state.size && it.sizeNums.indexOf(state.size) < 0) return false;
      if (state.q) { var q = norm(state.q); if (it._hay.indexOf(q) < 0 && it._hay.indexOf(cyr(q)) < 0) return false; }
      return true;
    }).length;
  }

  function renderChips() {
    var cats = [{ name: "", label: "Все" }].concat(data.categories.map(function (c) { return { name: c.name, label: c.name }; }));
    $("cats").innerHTML = cats.map(function (c) {
      var n = countFor(c.name);
      return '<button type="button" role="tab" class="chip' + (state.cat === c.name ? " on" : "") +
        '" data-cat="' + esc(c.name) + '" aria-selected="' + (state.cat === c.name) + '">' +
        esc(c.label) + '<span class="n">' + n + "</span></button>";
    }).join("");
    $("sizes").innerHTML = ['<button type="button" class="chip' + (state.size ? "" : " on") + '" data-size="0">Все</button>']
      .concat(data.sizes.map(function (s) {
        return '<button type="button" class="chip' + (state.size === s ? " on" : "") + '" data-size="' + s + '">' + s + "</button>";
      })).join("");
  }

  function card(it, i) {
    return '<a class="card" href="#' + esc(it.id) + '" data-id="' + esc(it.id) + '" style="animation-delay:' + Math.min(i, 12) * 30 + 'ms">' +
      '<div class="ph"><img src="' + esc(it.thumb) + '" srcset="' + esc(it.thumb) + " 480w, " + esc(it.thumb2x) + ' 720w" sizes="(min-width:960px) 260px, (min-width:640px) 33vw, 50vw"' +
      ' width="480" height="640" loading="' + (i < 6 ? "eager" : "lazy") + '" decoding="async" alt="' + esc(it.name) + '"></div>' +
      '<p class="t">' + esc(it.title) + "</p>" +
      '<p class="a">' + esc(it.article) + "</p>" +
      '<p class="s">' + esc(it.sizes.join(" · ")) + "</p>" +
      '<p class="p"><span>опт</span>' + rub(it.price) + "</p></a>";
  }

  function renderGrid() {
    var list = data.items.filter(matches);
    $("grid").innerHTML = list.map(card).join("");
    $("empty").hidden = list.length > 0;
    $("count").textContent = list.length + " " + plural(list.length, "модель", "модели", "моделей");
    $("reset").hidden = !(state.cat || state.size || state.q);
    renderChips();
  }

  // ---------- detail ----------
  var current = null, lastScroll = 0;

  function showDetail(id) {
    var it = byId[id];
    if (!it) return false;
    current = it;
    lastScroll = window.scrollY;
    $("slides").innerHTML = it.images.map(function (src, i) {
      return '<img src="' + esc(src) + '" width="720" height="960" alt="' + esc(it.name) + " — фото " + (i + 1) + '"' + (i ? ' loading="lazy"' : "") + ">";
    }).join("");
    $("dots").innerHTML = it.images.map(function (_, i) {
      return '<button type="button" aria-label="Фото ' + (i + 1) + '"' + (i ? "" : ' class="on"') + ' data-i="' + i + '"></button>';
    }).join("");
    $("slides").scrollLeft = 0;
    $("d-cat").textContent = it.category;
    $("d-title").textContent = it.title;
    $("d-article").textContent = it.article;
    $("d-price").textContent = rub(it.price);
    $("d-sizes").innerHTML = it.sizes.map(function (s) { return "<span>" + esc(s) + "</span>"; }).join("");
    $("d-meta").textContent = it.material ? "Материал: " + it.material : "";
    $("d-post").href = it.post;
    $("d-order").href = it.order;
    var v = $("detail-view");
    v.hidden = false;
    v.scrollTop = 0;
    document.body.classList.add("detail-open");
    if (inTelegram && tg.BackButton) tg.BackButton.show();
    document.title = it.name + " — ЭСЛАВИЯ";
    return true;
  }

  function hideDetail() {
    if ($("detail-view").hidden) return;
    $("detail-view").hidden = true;
    document.body.classList.remove("detail-open");
    if (inTelegram && tg.BackButton) tg.BackButton.hide();
    document.title = "ЭСЛАВИЯ — каталог";
    window.scrollTo(0, lastScroll);
    current = null;
  }

  var pushed = false;
  function goBack() {
    if (pushed) { pushed = false; history.back(); }
    else { history.replaceState(null, "", location.pathname + location.search); hideDetail(); }
  }

  function route() {
    var id = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (id && byId[id]) showDetail(id); else { pushed = false; hideDetail(); }
  }

  // ---------- events ----------
  function bind() {
    $("cats").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]"); if (!b) return;
      state.cat = b.getAttribute("data-cat"); haptic(); renderGrid();
      b = $("cats").querySelector(".on"); if (b && b.scrollIntoView) b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
    $("sizes").addEventListener("click", function (e) {
      var b = e.target.closest("[data-size]"); if (!b) return;
      var s = +b.getAttribute("data-size");
      state.size = state.size === s ? 0 : s; haptic(); renderGrid();
    });
    var t = null;
    $("q").addEventListener("input", function () {
      clearTimeout(t);
      $("q-clear").hidden = !this.value;
      var v = this.value;
      t = setTimeout(function () { state.q = v.trim(); renderGrid(); }, 120);
    });
    $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") this.blur(); });
    $("q-clear").addEventListener("click", function () { $("q").value = ""; this.hidden = true; state.q = ""; renderGrid(); });
    $("reset").addEventListener("click", function () {
      state = { cat: "", size: 0, q: "" }; $("q").value = ""; $("q-clear").hidden = true; renderGrid();
    });
    $("grid").addEventListener("click", function (e) {
      var a = e.target.closest(".card"); if (!a) return;
      e.preventDefault();
      pushed = true;
      history.pushState(null, "", "#" + a.getAttribute("data-id"));
      showDetail(a.getAttribute("data-id"));
    });
    window.addEventListener("popstate", route);
    window.addEventListener("hashchange", route);
    $("back").addEventListener("click", goBack);
    if (inTelegram && tg.BackButton) tg.BackButton.onClick(goBack);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && current) goBack(); });

    $("d-order").addEventListener("click", function (e) {
      if (!current) return; e.preventDefault(); openTg(current.order);
    });
    $("d-post").addEventListener("click", function (e) {
      if (!current) return; e.preventDefault(); openTg(current.post);
    });
    $("channel-link").addEventListener("click", function (e) { e.preventDefault(); openTg(this.href); });

    var slides = $("slides");
    slides.addEventListener("scroll", function () {
      var i = Math.round(slides.scrollLeft / Math.max(1, slides.clientWidth));
      [].forEach.call($("dots").children, function (d, k) { d.classList.toggle("on", k === i); });
    }, { passive: true });
    $("dots").addEventListener("click", function (e) {
      var b = e.target.closest("[data-i]"); if (!b) return;
      slides.scrollTo({ left: +b.getAttribute("data-i") * slides.clientWidth, behavior: "smooth" });
    });

    var controls = $("controls");
    window.addEventListener("scroll", function () {
      controls.classList.toggle("stuck", controls.getBoundingClientRect().top <= 0 && window.scrollY > 0);
    }, { passive: true });
  }

  // ---------- start ----------
  function startParam() {
    var p = "";
    try { p = (inTelegram && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || ""; } catch (e) {}
    if (!p) { var m = /[?&]tgWebAppStartParam=([^&#]+)/.exec(location.search); if (m) p = decodeURIComponent(m[1]); }
    return p;
  }

  fetch("data/catalog.json?v=" + (window.CATALOG_VERSION || "1"), { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      data = d;
      d.items.forEach(function (it) {
        byId[it.id] = it;
        it._hay = norm(it.name + " " + it.article + " " + it.category + " " + it.id);
      });
      bind();
      var sp = startParam();                  // e.g. startapp=m-102 opens that model
      if (sp && byId[sp]) history.replaceState(null, "", "#" + sp);
      else if (sp && sp.indexOf("cat-") === 0) {
        var c = d.categories[+sp.slice(4)]; if (c) state.cat = c.name;
      }
      renderGrid();
      route();
    })
    .catch(function () {
      $("grid").innerHTML = "";
      $("empty").hidden = false;
      $("empty").textContent = "Не удалось загрузить каталог. Проверьте соединение и откройте снова.";
    });
})();
