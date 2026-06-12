/* ============================================================
   DeckFlip deck v3 — 내비게이션·차트·인터랙션·발표자 모드
   (마스터 파이프라인 STEP 7 + 원샷 프롬프트 v2 규칙 준수)
   ============================================================ */
(function () {
  'use strict';

  var deck = document.getElementById('deck');
  var allSlides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var dots = document.getElementById('dots');
  var pageNoEl = document.getElementById('pageno');
  var sectEl = document.getElementById('sectlabel');
  var progress = document.getElementById('progress');
  var drawnCharts = {};

  function visibleSlides() {
    return allSlides.filter(function (s) {
      return !s.classList.contains('appendix-gate') || document.body.classList.contains('show-appendix');
    });
  }

  /* ---------- 도트 내비 ---------- */
  function buildDots() {
    dots.innerHTML = '';
    visibleSlides().forEach(function (s) {
      var b = document.createElement('button');
      if (s.classList.contains('appendix-gate')) b.className = 'appdot';
      b.setAttribute('aria-label', s.dataset.title || 'slide');
      b.onclick = function () { s.scrollIntoView({ behavior: 'smooth' }); };
      dots.appendChild(b);
    });
  }
  buildDots();

  /* ---------- 현재 슬라이드 추적 ---------- */
  var cur = 0;
  function syncChrome() {
    var vis = visibleSlides();
    var s = vis[cur]; if (!s) return;
    var dotEls = Array.prototype.slice.call(dots.children);
    dotEls.forEach(function (d, i) { d.classList.toggle('on', i === cur); });
    pageNoEl.textContent = (cur + 1) + ' / ' + vis.length;
    sectEl.textContent = s.dataset.section || '';
    progress.style.width = ((cur + 1) / vis.length * 100) + '%';
    if (window.threeScene) window.threeScene.show(s.dataset.scene || 'field');
    updateSpeaker(s);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.querySelectorAll('.reveal').forEach(function (r) { r.classList.add('in'); });
      var vis = visibleSlides();
      var i = vis.indexOf(e.target);
      if (i >= 0) { cur = i; syncChrome(); }
      if (e.target.dataset.chart && !drawnCharts[e.target.dataset.chart]) initChart(e.target.dataset.chart);
    });
  }, { threshold: 0.5 });
  allSlides.forEach(function (s) { io.observe(s); });

  /* ---------- 키보드 ---------- */
  function go(d) {
    var vis = visibleSlides();
    cur = Math.max(0, Math.min(vis.length - 1, cur + d));
    vis[cur].scrollIntoView({ behavior: 'smooth' });
  }
  addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case 'ArrowDown': case 'PageDown': case ' ': e.preventDefault(); go(1); break;
      case 'ArrowUp': case 'PageUp': e.preventDefault(); go(-1); break;
      case 'Home': e.preventDefault(); go(-999); break;
      case 'End': e.preventDefault(); go(999); break;
      case 's': case 'S': case 'ㄴ': toggleSpeaker(); break;
      case 'a': case 'A': case 'ㅁ': toggleAppendix(); break;
      case '?': case '/': document.body.classList.toggle('help-on'); break;
      case 'Escape': document.body.classList.remove('help-on'); break;
    }
  });
  document.getElementById('helpov').addEventListener('click', function () {
    document.body.classList.remove('help-on');
  });

  /* ---------- 부록(Q&A) 게이트 ---------- */
  function toggleAppendix() {
    var was = document.body.classList.contains('show-appendix');
    document.body.classList.toggle('show-appendix');
    buildDots();
    var vis = visibleSlides();
    if (!was) {
      var first = document.querySelector('.appendix-gate');
      cur = vis.indexOf(first);
      first.scrollIntoView({ behavior: 'smooth' });
    } else {
      cur = Math.min(cur, vis.length - 1);
    }
    syncChrome();
  }

  /* ---------- 발표자 모드 (S) ---------- */
  var spTimerStart = null, spTimerIv = null;
  function toggleSpeaker() {
    document.body.classList.toggle('speaker-on');
    if (document.body.classList.contains('speaker-on')) {
      if (!spTimerStart) spTimerStart = Date.now();
      if (!spTimerIv) spTimerIv = setInterval(tickTimer, 1000);
      var vis = visibleSlides(); updateSpeaker(vis[cur]);
    }
  }
  function tickTimer() {
    var el = document.getElementById('sptimer');
    if (!el || !spTimerStart) return;
    var sec = Math.floor((Date.now() - spTimerStart) / 1000);
    var m = Math.floor(sec / 60), s = sec % 60;
    el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    el.classList.toggle('over', sec > 600); // 10분 초과 경고
  }
  function updateSpeaker(slide) {
    if (!document.body.classList.contains('speaker-on') || !slide) return;
    var note = slide.querySelector('.notes');
    var out = document.getElementById('spnote');
    var ttl = document.getElementById('sptitle');
    ttl.textContent = '발표자 노트 — ' + (slide.dataset.title || '');
    out.innerHTML = note ? note.innerHTML : '<span class="cue">이 슬라이드는 화면을 가리키며 짧게 짚고 넘어갑니다</span>';
  }

  /* ---------- Chart.js (datalabels 전역 OFF 후 차트별 ON — 원샷 프롬프트 v2 §5) ---------- */
  if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
    Chart.defaults.set('plugins.datalabels', { display: false });
    Chart.defaults.font.family = "'Pretendard', sans-serif";
    Chart.defaults.color = '#A3B2D4';
  }

  function initChart(name) {
    if (typeof Chart === 'undefined' || drawnCharts[name]) return;
    try {
      if (name === 'market') drawnCharts[name] = chartMarket();
      if (name === 'cost') drawnCharts[name] = chartCost();
    } catch (e) { /* 차트 실패가 발표를 막지 않게 */ }
  }

  function chartMarket() {
    var el = document.getElementById('marketChart'); if (!el) return null;
    return new Chart(el, {
      type: 'bar',
      data: {
        labels: ['2024', '2029~2030 (전망)'],
        datasets: [
          { label: 'AI 프레젠테이션 SW (십억 달러)', data: [1.54, 4.79],
            backgroundColor: 'rgba(34,211,238,.62)', borderColor: '#22D3EE', borderWidth: 2, borderRadius: 9, maxBarThickness: 86 },
          { label: '발표 SW 전체 (십억 달러)', data: [8.0, 18.0],
            backgroundColor: 'rgba(224,33,138,.55)', borderColor: '#E0218A', borderWidth: 2, borderRadius: 9, maxBarThickness: 86 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 1200 },
        plugins: {
          legend: { labels: { color: '#A3B2D4', font: { size: 12.5 } } },
          datalabels: {
            display: true, color: '#FFF', font: { size: 13, weight: 'bold' },
            anchor: 'end', align: 'top',
            textStrokeColor: 'rgba(0,0,0,0.5)', textStrokeWidth: 2,
            formatter: function (v) { return '$' + v + 'B'; }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.07)' },
               ticks: { color: '#7D8CB0', callback: function (v) { return '$' + v + 'B'; } } },
          x: { grid: { display: false },
               ticks: { color: '#EDF2FF', font: { family: "'Space Grotesk'", size: 14, weight: '600' } } }
        }
      }
    });
  }

  function chartCost() {
    var el = document.getElementById('costChart'); if (!el) return null;
    return new Chart(el, {
      type: 'bar',
      data: {
        labels: ['외주 디자인 (숨고·크몽)', 'DeckFlip 생성 원가'],
        datasets: [{
          label: '발표자료 1건 비용 (원)',
          data: [125000, 2000],
          backgroundColor: ['rgba(248,113,113,.5)', 'rgba(52,211,153,.6)'],
          borderColor: ['#F87171', '#34D399'], borderWidth: 2, borderRadius: 9, maxBarThickness: 60
        }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 1200 },
        plugins: {
          legend: { display: false },
          datalabels: {
            display: true, color: '#FFF', font: { size: 13, weight: 'bold' },
            anchor: 'end',
            align: function (ctx) { return ctx.dataIndex === 0 ? 'left' : 'right'; },
            textStrokeColor: 'rgba(0,0,0,0.6)', textStrokeWidth: 3,
            formatter: function (v) { return v >= 10000 ? '평균 ' + (v / 10000) + '만 원' : '약 ' + (v / 1000) + '천 원' }
          }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.07)' },
               ticks: { color: '#7D8CB0', callback: function (v) { return (v / 10000) + '만' } } },
          y: { grid: { display: false }, ticks: { color: '#EDF2FF', font: { size: 13, weight: '600' } } }
        }
      }
    });
  }

  /* ---------- 투표 (정직 표기: 데모용 초기 형태 — 기기 안에서만 집계) ---------- */
  var poll = { 'PowerPoint': 41, 'Canva·미리캔버스': 24, 'Gamma·Genspark': 16, '외주·기타': 9 };
  var pollKeys = Object.keys(poll);
  function renderPoll() {
    var tot = pollKeys.reduce(function (a, k) { return a + poll[k]; }, 0);
    document.getElementById('pollBars').innerHTML = pollKeys.map(function (k) {
      var p = Math.round(poll[k] / tot * 100);
      return '<div class="bar-line"><span class="lab">' + k + '</span>' +
        '<span class="track"><span class="fill" style="width:' + p + '%"></span></span>' +
        '<span class="pct">' + p + '%</span></div>';
    }).join('');
  }
  (function buildPoll() {
    var box = document.getElementById('pollOpts'); if (!box) return;
    box.innerHTML = pollKeys.map(function (k) { return '<button data-k="' + k + '">' + k + ' +1</button>'; }).join('');
    Array.prototype.forEach.call(box.children, function (b) {
      b.onclick = function () { poll[b.dataset.k]++; renderPoll(); };
    });
    renderPoll();
  })();

  /* ---------- 절감 계산기 ---------- */
  var rng = document.getElementById('calcR');
  function calc() {
    if (!rng) return;
    var n = +rng.value;
    document.getElementById('calcN').textContent = n;
    // 1건 140분: Nielsen·empower 2020 (주당 작업 7시간 ÷ 주당 3건) · DeckFlip 7분: 자사 실측 5~7분 상단
    var saved = (n * (140 - 7)) / 60;
    document.getElementById('calcOut').textContent = '약 ' + saved.toFixed(1) + '시간 절감';
  }
  if (rng) { rng.addEventListener('input', calc); calc(); }

  /* ---------- 조작 힌트 자동 숨김 (첫 화면에서만 잠시) ---------- */
  setTimeout(function () {
    var h = document.querySelector('.hint');
    if (h) h.classList.add('faded');
  }, 9000);

  /* ---------- 마우스 오라 (≤200px — 원샷 프롬프트 v2 §4) ---------- */
  var aura = document.getElementById('aura');
  if (aura && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    addEventListener('pointermove', function (e) {
      aura.style.left = e.clientX + 'px'; aura.style.top = e.clientY + 'px';
    }, { passive: true });
  }

  /* ---------- 인쇄/Headless 강제 init (파이프라인 STEP 7 필수 훅) ---------- */
  function initAll() {
    document.body.classList.add('show-appendix');
    // PDF 엔진이 기존 .watermark를 누락시키는 문제 우회 — 인쇄용 복제본 생성
    document.querySelectorAll('.watermark').forEach(function (w) {
      if (w.dataset.printClone) return;
      w.dataset.printClone = '1';
      var c = document.createElement('div');
      c.className = 'watermark-print';
      c.textContent = w.textContent;
      w.parentElement.appendChild(c);
    });
    allSlides.forEach(function (s) {
      s.querySelectorAll('.reveal').forEach(function (r) { r.classList.add('in'); });
    });
    void document.body.offsetHeight; // 강제 리플로우 → 차트 컨테이너 최종 크기 확보
    initChart('market'); initChart('cost');
    Object.keys(drawnCharts).forEach(function (k) {
      try { if (drawnCharts[k]) drawnCharts[k].resize(); } catch (e) {}
    });
    if (window.threeScene) window.threeScene.renderOnce();
  }
  if (navigator.userAgent.includes('HeadlessChrome')) setTimeout(initAll, 300);
  addEventListener('beforeprint', initAll);

  syncChrome();
})();
