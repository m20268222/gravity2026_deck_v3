/* ============================================================
   복순도가 v7 — 내비게이션 · 차트 · 인쇄 훅
   ============================================================ */
(function () {
  'use strict';

  var deck = document.querySelector('.deck');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var TOTAL = slides.length;
  var IS_HEADLESS = navigator.userAgent.includes('HeadlessChrome');

  /* ---------- 1920×1080 캔버스 스케일 ---------- */
  function fitScale() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.documentElement.style.setProperty('--s', s.toFixed(4));
  }
  fitScale();
  window.addEventListener('resize', fitScale);

  /* ---------- 진행바 / 인디케이터 ---------- */
  var progress = document.getElementById('progress');
  var indicator = document.getElementById('indicator');
  var current = 0;

  function setCurrent(idx) {
    current = idx;
    if (progress) progress.style.width = ((idx + 1) / TOTAL * 100) + '%';
    if (indicator) indicator.textContent = String(idx + 1).padStart(2, '0') + ' / ' + TOTAL;
    var scene = slides[idx].getAttribute('data-scene');
    if (window.threeScene) {
      if (scene === 'ongi') window.threeScene.show();
      else window.threeScene.hide();
    }
    if (typeof updatePresenter === 'function') updatePresenter(idx);
  }

  /* ---------- 키보드 내비 ---------- */
  function goTo(idx) {
    idx = Math.max(0, Math.min(TOTAL - 1, idx));
    slides[idx].scrollIntoView({ behavior: 'smooth' });
    if (typeof closeFilmstrip === 'function') closeFilmstrip();
  }
  /* 숫자 입력 → 해당 페이지로 점프 (예: 2,1 입력 후 Enter 또는 잠시 멈추면 21쪽) */
  var jumpBuf = '';
  var jumpTimer = null;
  function commitJump() {
    clearTimeout(jumpTimer);
    if (!jumpBuf) return;
    var n = parseInt(jumpBuf, 10);
    jumpBuf = '';
    if (!isNaN(n) && n >= 1 && n <= TOTAL) goTo(n - 1);
    else setCurrent(current);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      jumpBuf += e.key;
      if (indicator) indicator.textContent = '→ ' + jumpBuf + ' 쪽';
      clearTimeout(jumpTimer);
      jumpTimer = setTimeout(commitJump, 1100);
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); commitJump(); return; }
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goTo(current + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goTo(current - 1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(TOTAL - 1); }
  });
  /* 하단 인디케이터 클릭 → 페이지 번호 입력 */
  if (indicator) {
    indicator.style.cursor = 'pointer';
    indicator.title = '클릭하거나 숫자 입력 후 Enter로 페이지 이동';
    indicator.addEventListener('click', function () {
      var v = window.prompt('이동할 페이지 번호 (1 - ' + TOTAL + ')', String(current + 1));
      if (v === null) { setCurrent(current); return; }
      var n = parseInt(v, 10);
      if (!isNaN(n) && n >= 1 && n <= TOTAL) goTo(n - 1);
      else setCurrent(current);
    });
  }

  /* ---------- IntersectionObserver: reveal + 차트 lazy init ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add('in-view');
        var idx = slides.indexOf(en.target);
        if (idx >= 0) setCurrent(idx);
        var chartId = en.target.getAttribute('data-chart');
        if (chartId) initChart(chartId);
      }
    });
  }, { threshold: 0.55 });
  slides.forEach(function (s) { io.observe(s); });

  /* ============================================================
     Chart.js
     ============================================================ */
  var drawn = {};
  var INK = '#221D16', SUB = '#5B5347', MUTED = '#978C7B';
  var RED = '#C03A2E', GOLD = '#A9854B', GOLDSOFT = '#C6AB7C', BORDER = '#E6DCC8';

  if (window.Chart) {
    if (window.ChartDataLabels) Chart.register(ChartDataLabels);
    Chart.defaults.font.family = "'Pretendard', sans-serif";
    Chart.defaults.font.size = 15;
    Chart.defaults.color = SUB;
    Chart.defaults.set('plugins.datalabels', { display: false });
  }

  var GRID = { color: BORDER, drawBorder: false };

  var CHART_DEFS = {
    /* 재무 진단 ① — 매출(bar) + 영업이익(line) */
    financeChart: function (ctx) {
      return new Chart(ctx, {
        data: {
          labels: ['2023', '2024', '2025'],
          datasets: [
            {
              type: 'bar', label: '매출액 (억 원)', order: 2,
              data: [101.1, 98.9, 87.3],
              backgroundColor: [GOLDSOFT, GOLDSOFT, RED],
              barPercentage: 0.5,
              datalabels: {
                display: true, anchor: 'end', align: 'top',
                color: INK, font: { size: 17, weight: 'bold' },
                formatter: function (v) { return v.toFixed(1); }
              }
            },
            {
              type: 'line', label: '영업이익 (억 원)', order: 1,
              data: [45.7, 30.2, 7.8],
              borderColor: INK, backgroundColor: '#FFFFFF',
              borderWidth: 3, pointRadius: 5, pointBackgroundColor: INK,
              pointBorderColor: '#FFFFFF', pointBorderWidth: 1.5, tension: 0.1,
              datalabels: {
                display: true, align: 'bottom', offset: 10,
                color: INK, font: { size: 16, weight: 'bold' },
                textStrokeColor: '#FFFFFF', textStrokeWidth: 4,
                formatter: function (v) { return v.toFixed(1); }
              }
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, padding: 18, font: { size: 15 } } } },
          scales: {
            y: { beginAtZero: true, suggestedMax: 115, grid: GRID, ticks: { font: { size: 14 } } },
            x: { grid: { display: false }, ticks: { font: { size: 16 } } }
          }
        }
      });
    },

    /* 재무 진단 ② — 광고선전비(bar) + 광고비/매출 비율(line, 우축) */
    adChart: function (ctx) {
      return new Chart(ctx, {
        data: {
          labels: ['2023', '2024', '2025'],
          datasets: [
            {
              type: 'bar', label: '광고선전비 (억 원)', yAxisID: 'y', order: 2,
              data: [1.69, 4.52, 5.96],
              backgroundColor: [GOLDSOFT, '#B98E62', RED],
              barPercentage: 0.5,
              datalabels: {
                display: true, anchor: 'center', align: 'center',
                color: '#FFFFFF', font: { size: 17, weight: 'bold' },
                textStrokeColor: 'rgba(0,0,0,0.35)', textStrokeWidth: 2,
                formatter: function (v) { return v.toFixed(2); }
              }
            },
            {
              type: 'line', label: '광고비 ÷ 매출액 (%)', yAxisID: 'y2', order: 1,
              data: [1.67, 4.57, 6.83],
              borderColor: INK, backgroundColor: '#FFFFFF',
              borderWidth: 3, pointRadius: 5, pointBackgroundColor: INK,
              pointBorderColor: '#FFFFFF', pointBorderWidth: 1.5, tension: 0.1,
              datalabels: {
                display: true, align: 'top', offset: 14,
                color: INK, font: { size: 15, weight: 'bold' },
                textStrokeColor: '#FFFFFF', textStrokeWidth: 4,
                formatter: function (v) { return v.toFixed(2) + '%'; }
              }
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, padding: 18, font: { size: 15 } } } },
          scales: {
            y: { beginAtZero: true, suggestedMax: 7.5, grid: GRID, ticks: { font: { size: 14 } } },
            y2: { position: 'right', beginAtZero: true, suggestedMax: 8.5, grid: { display: false }, ticks: { font: { size: 14 }, callback: function (v) { return v + '%'; } } },
            x: { grid: { display: false }, ticks: { font: { size: 16 } } }
          }
        }
      });
    },

    /* 시장 — 전통주 출고금액 (bar) */
    marketChart: function (ctx) {
      return new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['2021', '2022', '2023', '2024'],
          datasets: [{
            label: '전통주 출고금액 (억 원)',
            data: [941, 1629, 1475, 1374],
            backgroundColor: [GOLDSOFT, GOLD, '#B98E62', RED],
            barPercentage: 0.55,
            datalabels: {
              display: true, anchor: 'end', align: 'top',
              color: INK, font: { size: 17, weight: 'bold' },
              formatter: function (v) { return v.toLocaleString(); }
            }
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, padding: 18, font: { size: 15 } } } },
          scales: {
            y: { beginAtZero: true, suggestedMax: 1850, grid: GRID, ticks: { font: { size: 14 } } },
            x: { grid: { display: false }, ticks: { font: { size: 16 } } }
          }
        }
      });
    }
  };

  function initChart(id) {
    if (drawn[id] || !window.Chart) return;
    var el = document.getElementById(id);
    if (!el) return;
    try { drawn[id] = CHART_DEFS[id](el.getContext('2d')); } catch (e) {}
  }

  /* ============================================================
     인쇄/헤드리스 — 전 요소 강제 노출 + 전 차트 init (v4 교훈)
     ============================================================ */
  function initAll() {
    slides.forEach(function (s) { s.classList.add('in-view'); });
    void document.body.offsetHeight;               // 강제 리플로우
    Object.keys(CHART_DEFS).forEach(initChart);
    Object.keys(drawn).forEach(function (k) {
      try { drawn[k].resize(); } catch (e) {}
    });
    if (window.threeScene) window.threeScene.renderOnce();
  }
  window.addEventListener('beforeprint', initAll);
  if (IS_HEADLESS) setTimeout(initAll, 400);

  /* ============================================================
     발표자 도구 — 미리보기 · 대본(C) · Q&A(A) · 타이머(T) · 도움말(?)
     ============================================================ */
  var DATA = window.PRESENTER || { notes: {}, qa: [] };
  var $ = function (id) { return document.getElementById(id); };
  var filmstrip = $('filmstrip'), fsZone = $('fsZone'), fsScroll = $('fsScroll');
  var notesbar = $('notesbar'), nbNo = $('nbNo'), nbTitle = $('nbTitle'), nbBody = $('nbBody');
  var qaOverlay = $('qaOverlay'), qaGrid = $('qaGrid'), helpOverlay = $('helpOverlay');
  var ptimer = $('ptimer'), ptTime = ptimer ? ptimer.querySelector('.pt-time') : null;
  var blackout = $('blackout'), hint = $('hint');

  var notesOpen = false, qaOpen = false, helpOpen = false, blackoutOn = false;

  /* ---- 썸네일 미리보기 패널 ---- */
  function labelFor(i) { return (DATA.notes[i] && DATA.notes[i].t) || ('슬라이드 ' + i); }
  if (fsScroll) {
    var frag = document.createDocumentFragment();
    for (var i = 1; i <= TOTAL; i++) {
      var nn = String(i).padStart(2, '0');
      var btn = document.createElement('button');
      btn.className = 'fs-item';
      btn.setAttribute('data-go', i);
      btn.innerHTML =
        '<span class="fs-thumb"><img src="thumbs/t' + nn + '.jpg" alt="" ' +
        'onerror="this.style.display=\'none\'"></span>' +
        '<span class="fs-meta"><span class="fs-no">P.' + nn + '</span>' +
        '<span class="fs-label">' + labelFor(i) + '</span></span>';
      frag.appendChild(btn);
    }
    fsScroll.appendChild(frag);
    fsScroll.addEventListener('click', function (e) {
      var it = e.target.closest('.fs-item');
      if (!it) return;
      goTo(parseInt(it.getAttribute('data-go'), 10) - 1);
      closeFilmstrip();
    });
  }
  var fsItems = fsScroll ? fsScroll.querySelectorAll('.fs-item') : [];
  function openFilmstrip() { if (filmstrip) filmstrip.classList.add('open'); }
  function closeFilmstrip() { if (filmstrip) filmstrip.classList.remove('open'); }
  if (fsZone) fsZone.addEventListener('mouseenter', openFilmstrip);
  if (filmstrip) filmstrip.addEventListener('mouseleave', closeFilmstrip);

  /* ---- 목차 클릭 → 섹션 이동 ---- */
  document.querySelectorAll('.toc-link').forEach(function (el) {
    el.addEventListener('click', function () {
      var g = parseInt(el.getAttribute('data-go'), 10);
      if (g) goTo(g - 1);
    });
  });

  /* ---- 대본 패널 (C) ---- */
  function renderNotes(idx) {
    var n = DATA.notes[idx + 1];
    if (!n || !nbBody) return;
    nbNo.textContent = String(idx + 1).padStart(2, '0');
    nbTitle.textContent = n.t || '';
    var html = n.s || '';
    if (n.c) html += '<span class="cue">🎙 ' + n.c + '</span>';
    nbBody.innerHTML = html;
    nbBody.scrollTop = 0;
  }
  function toggleNotes() {
    notesOpen = !notesOpen;
    if (notesbar) notesbar.classList.toggle('open', notesOpen);
    if (notesOpen) renderNotes(current);
  }

  /* ---- Q&A 오버레이 (A) ---- */
  function buildQA() {
    if (!qaGrid || qaGrid.children.length) return;
    (DATA.qa || []).forEach(function (item) {
      var c = document.createElement('div');
      c.className = 'qa-card';
      c.innerHTML = '<div class="q">' + item.q + '</div><div class="a">' + item.a + '</div>';
      qaGrid.appendChild(c);
    });
  }
  function toggleQA() {
    buildQA();
    qaOpen = !qaOpen;
    if (helpOpen) { helpOpen = false; helpOverlay.classList.remove('open'); }
    if (qaOverlay) qaOverlay.classList.toggle('open', qaOpen);
    closeFilmstrip();
  }

  /* ---- 도움말 오버레이 (? / H) ---- */
  function toggleHelp() {
    helpOpen = !helpOpen;
    if (qaOpen) { qaOpen = false; qaOverlay.classList.remove('open'); }
    if (helpOverlay) helpOverlay.classList.toggle('open', helpOpen);
    closeFilmstrip();
  }

  function closeAllOverlays() {
    qaOpen = helpOpen = blackoutOn = false;
    if (qaOverlay) qaOverlay.classList.remove('open');
    if (helpOverlay) helpOverlay.classList.remove('open');
    if (blackout) blackout.classList.remove('on');
  }
  document.querySelectorAll('.overlay .ov-close').forEach(function (b) {
    b.addEventListener('click', closeAllOverlays);
  });
  [qaOverlay, helpOverlay].forEach(function (ov) {
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) closeAllOverlays(); });
  });

  /* ---- 발표 타이머 (T) ---- */
  var timerStart = null, timerInt = null, timerOn = false;
  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function renderTimer() {
    if (!timerStart || !ptTime) return;
    var ms = Date.now() - timerStart;
    ptTime.textContent = fmt(ms);
    ptimer.classList.toggle('over', ms >= 20 * 60 * 1000);
  }
  function toggleTimer() {
    timerOn = !timerOn;
    if (ptimer) ptimer.classList.toggle('show', timerOn);
    if (timerOn && !timerStart) {
      timerStart = Date.now();
      timerInt = setInterval(renderTimer, 1000);
      renderTimer();
    }
  }
  if (ptimer) ptimer.addEventListener('click', function () {
    timerStart = Date.now(); renderTimer();
  });

  /* ---- 전체화면 (F) ---- */
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    if (!d.fullscreenElement) { (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el); }
    else { (d.exitFullscreen || d.webkitExitFullscreen || function () {}).call(d); }
  }

  /* ---- 블랙아웃 (B) ---- */
  function toggleBlackout() {
    blackoutOn = !blackoutOn;
    if (blackout) blackout.classList.toggle('on', blackoutOn);
  }

  /* ---- 키 입력 (캡처 단계 — 기존 내비게이션보다 먼저) ---- */
  var NAV = ['ArrowDown', 'ArrowUp', 'Space', 'PageDown', 'PageUp', 'Home', 'End', 'Enter'];
  function presenterKeys(e) {
    var code = e.code;
    var modal = qaOpen || helpOpen || blackoutOn;
    if (modal && (NAV.indexOf(code) !== -1 || /^Digit|^Numpad/.test(code))) {
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    var handled = true;
    switch (code) {
      case 'KeyA': toggleQA(); break;
      case 'KeyC': toggleNotes(); break;
      case 'KeyT': toggleTimer(); break;
      case 'KeyF': toggleFullscreen(); break;
      case 'KeyB': toggleBlackout(); break;
      case 'KeyH': toggleHelp(); break;
      case 'Slash': if (e.shiftKey) toggleHelp(); else handled = false; break;
      case 'Escape': closeAllOverlays(); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); hideHint(); }
  }
  document.addEventListener('keydown', presenterKeys, true);

  /* ---- 단축키 힌트 토스트 ---- */
  var hintTimer = null;
  function hideHint() { if (hint) hint.classList.add('gone'); if (hintTimer) clearTimeout(hintTimer); }
  if (hint) {
    if (IS_HEADLESS) { hint.style.display = 'none'; }
    else { hintTimer = setTimeout(hideHint, 6500); document.addEventListener('mousedown', hideHint, { once: true }); }
  }

  /* ---- 슬라이드 변경 시 발표자 UI 갱신 ---- */
  function updatePresenter(idx) {
    if (fsItems && fsItems.length) {
      for (var k = 0; k < fsItems.length; k++) {
        var on = (k === idx);
        fsItems[k].classList.toggle('active', on);
        if (on && filmstrip && filmstrip.classList.contains('open')) {
          fsItems[k].scrollIntoView({ block: 'nearest' });
        }
      }
    }
    if (notesOpen) renderNotes(idx);
  }

  /* 초기 슬라이드 세팅 */
  setCurrent(0);
})();
