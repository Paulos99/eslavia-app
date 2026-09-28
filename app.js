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

  // Letterbox (object-fit: contain) takes the colour of the photo's own left/right edge,
  // so the bars beside the figure blend into the studio background instead of showing a stripe.
  var edgeCanvas = null;
  function edgeBg(img) {
    try {
      var W = 32, H = 16;
      edgeCanvas = edgeCanvas || document.createElement("canvas");
      edgeCanvas.width = W; edgeCanvas.height = H;
      var cx = edgeCanvas.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0, W, H);
      var d = cx.getImageData(0, 0, W, H).data;
      // vertical gradient that follows one edge column; only light, near-neutral studio backgrounds are
      // copied, anything else (e.g. a lifestyle photo) falls back to plain white
      var side = function (x) {
        var stops = [], ok = true;
        for (var y = 0; y < H; y++) {
          var o = (y * W + x) * 4, r = d[o], g = d[o + 1], b = d[o + 2];
          if (Math.min(r, g, b) < 190 || Math.max(r, g, b) - Math.min(r, g, b) > 40) ok = false;
          stops.push("rgb(" + r + "," + g + "," + b + ") " + ((y + 0.5) / H * 100).toFixed(1) + "%");
        }
        return (ok ? "linear-gradient(" + stops.join(",") + ")" : "linear-gradient(#fff,#fff)");
      };
      img.style.background = side(0) + " left / 50% 100% no-repeat, " + side(W - 1) + " right / 50% 100% no-repeat, #fff";
    } catch (e) { /* keep the neutral CSS background */ }
  }

  // ---------- photo navigation (same as swiping: flips the current model's photos, no loop) ----------
  var navTarget = null, navTimer = 0;
  function slideCount() { return $("slides").children.length; }
  function slideIndex() {
    var s = $("slides");
    return Math.round(s.scrollLeft / Math.max(1, s.clientWidth));
  }
  function updateNav() {
    var i = navTarget != null ? navTarget : slideIndex(), n = slideCount();
    $("nav-prev").disabled = i <= 0;
    $("nav-next").disabled = i >= n - 1;
  }
  // put the arrows over the edges of the visible photo (contain leaves side bars on wide screens)
  function placeNav() {
    var s = $("slides");
    if (!s.clientWidth) return;
    var pw = Math.min(s.clientWidth, s.clientHeight * 0.75);
    s.parentNode.style.setProperty("--nav-inset", Math.max(0, Math.round((s.clientWidth - pw) / 2)) + "px");
  }
  function goPhoto(delta) {
    var s = $("slides"), n = slideCount();
    if (n < 2) return;
    var base = navTarget != null ? navTarget : slideIndex();
    var t = Math.max(0, Math.min(n - 1, base + delta));
    if (t === base) return;
    navTarget = t;
    clearTimeout(navTimer);
    navTimer = setTimeout(function () { navTarget = null; updateNav(); }, 800);
    var smooth = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    s.scrollTo({ left: t * s.clientWidth, behavior: smooth ? "smooth" : "auto" });
    updateNav();
  }

  function showDetail(id) {
    var it = byId[id];
    if (!it) return false;
    current = it;
    lastScroll = window.scrollY;
    $("slides").innerHTML = it.images.map(function (src, i) {
      return '<img src="' + esc(src) + '" width="720" height="960" alt="' + esc(it.name) + " — фото " + (i + 1) + '"' + (i ? ' loading="lazy"' : "") + ">";
    }).join("");
    [].forEach.call($("slides").querySelectorAll("img"), function (img) {
      if (img.complete && img.naturalWidth) edgeBg(img); else img.addEventListener("load", function () { edgeBg(img); }, { once: true });
    });
    $("dots").innerHTML = it.images.map(function (_, i) {
      return '<button type="button" aria-label="Фото ' + (i + 1) + '"' + (i ? "" : ' class="on"') + ' data-i="' + i + '"></button>';
    }).join("");
    $("slides").scrollLeft = 0;
    navTarget = null;
    $("nav-prev").hidden = $("nav-next").hidden = it.images.length < 2;
    updateNav();
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
    placeNav();
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
    document.addEventListener("keydown", function (e) {
      if (!current) return;
      if (e.key === "Escape") { goBack(); return; }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        var tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
        e.preventDefault();
        goPhoto(e.key === "ArrowLeft" ? -1 : 1);
      }
    });

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
      if (navTarget != null && Math.abs(slides.scrollLeft - navTarget * slides.clientWidth) < 2) navTarget = null;
      updateNav();
    }, { passive: true });
    $("nav-prev").addEventListener("click", function () { goPhoto(-1); });
    window.addEventListener("resize", function () {
      if (!current) return;
      placeNav();
      var i = navTarget != null ? navTarget : slideIndex();
      navTarget = null;
      slides.scrollLeft = i * slides.clientWidth;   // keep the same photo after a resize
      updateNav();
    });
    $("nav-next").addEventListener("click", function () { goPhoto(1); });
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

  fetch("./data/catalog.json?v=" + (window.CATALOG_VERSION || "1"), { cache: "no-cache" })
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
