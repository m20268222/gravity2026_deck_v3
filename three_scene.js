/* ============================================================
   DeckFlip deck v3 — 콘텐츠 맞춤 3D 엔진 (파이프라인 STEP 8-A)
   단일 persistent 캔버스 + 씬 팩토리 + 크로스페이드 씬 매니저
   - 씬은 주제와 직결: gravity(4대 과기원 공전) / flip(문서→슬라이드)
     pipeline(5단계 생성 흐름) / globe(글로벌 확장) / field(저자극 별)
   - 루프는 절대 멈추지 않음: rAF 먼저 예약, 본문 try/catch
   - Headless 감지 시 1프레임만 렌더 (PDF 인쇄 블로킹 방지)
   ============================================================ */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (REDUCED) return;

  var canvas = document.getElementById('bg3d');
  if (!canvas) return;

  var renderer, camera, mouse = { x: 0, y: 0 };
  var scenes = {};            // name -> {scene, group, update(t,dt), fade}
  var current = null, previous = null;
  var fadeT = 1;              // 0→1 크로스페이드 진행 카운터 (플래그 고착 방지)
  var FADE_SEC = 0.85;
  var headless = navigator.userAgent.includes('HeadlessChrome');
  var paused = false;

  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
    camera.position.set(0, 2.5, 34);
  } catch (e) { return; }

  /* ---------- 공용 헬퍼 ---------- */
  function makeScene() {
    var sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0x9DB2FF, 0.55));
    var p1 = new THREE.PointLight(0xFFFFFF, 1.0, 260); p1.position.set(14, 18, 24); sc.add(p1);
    var p2 = new THREE.PointLight(0x7C3AED, 0.85, 160); p2.position.set(-16, -8, 10); sc.add(p2);
    return sc;
  }
  function textSprite(text, hex, big) {
    var w = big ? 460 : 256, h = 72;
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var x = cv.getContext('2d');
    x.font = 'bold ' + (big ? 40 : 36) + 'px "Space Grotesk", Pretendard, Arial';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#' + hex.toString(16).padStart(6, '0'); x.shadowBlur = 18;
    x.fillStyle = '#FFFFFF'; x.fillText(text, w / 2, h / 2);
    var tx = new THREE.CanvasTexture(cv); tx.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
    var s = big ? 1.5 : 1.05; sp.scale.set(s * (w / h), s, 1);
    return sp;
  }
  function setOpacity(group, v) {
    group.traverse(function (o) {
      if (o.material) {
        o.material.transparent = true;
        if (o.userData.baseOpacity === undefined) o.userData.baseOpacity = (o.material.opacity != null ? o.material.opacity : 1);
        o.material.opacity = o.userData.baseOpacity * v;
      }
    });
  }

  /* ---------- 씬 1 · gravity — GRAVITY 코어 + 4대 과기원 공전 ---------- */
  function buildGravity() {
    var sc = makeScene(), g = new THREE.Group(); sc.add(g);
    var core = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 48, 48),
      new THREE.MeshStandardMaterial({ color: 0xF4F2FF, emissive: 0xBFA8FF, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.3 }));
    g.add(core);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(3.8, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xE6DEFF, transparent: true, opacity: 0.1 })));
    var lab = textSprite('GRAVITY 2026', 0x9B5DE5, true); lab.position.set(0, 4.8, 0); g.add(lab);

    var SCHOOLS = [
      { n: 'KAIST', c: 0x2D6CDF, r: 8.2, inc: 0.18, sp: 0.32 },
      { n: 'GIST', c: 0x22A7E0, r: 11.2, inc: -0.28, sp: 0.26 },
      { n: 'DGIST', c: 0x5A6CF0, r: 14.2, inc: 0.40, sp: 0.20 },
      { n: 'UNIST', c: 0x4CC9F0, r: 17.2, inc: -0.48, sp: 0.16 }
    ];
    var sats = [];
    SCHOOLS.forEach(function (s) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 28),
        new THREE.MeshStandardMaterial({ color: s.c, emissive: s.c, emissiveIntensity: 0.42, roughness: 0.4, metalness: 0.25 }));
      var la = textSprite(s.n, s.c); la.position.y = 1.85;
      var h = new THREE.Group(); h.add(m); h.add(la); g.add(h);
      var pts = [];
      for (var i = 0; i <= 128; i++) {
        var a = i / 128 * Math.PI * 2, zz = Math.sin(a) * s.r;
        pts.push(new THREE.Vector3(Math.cos(a) * s.r, zz * Math.sin(s.inc), zz * Math.cos(s.inc)));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.32 })));
      sats.push({ h: h, a: Math.random() * 6.28, r: s.r, inc: s.inc, sp: s.sp });
    });
    return {
      scene: sc, group: g,
      update: function (t, dt) {
        g.rotation.y += 0.0014;
        sats.forEach(function (n) {
          n.a += n.sp * dt * 0.6;
          var zz = Math.sin(n.a) * n.r;
          n.h.position.set(Math.cos(n.a) * n.r, zz * Math.sin(n.inc), zz * Math.cos(n.inc));
        });
      }
    };
  }

  /* ---------- 씬 2 · flip — 문서 페이지가 빨려들어 슬라이드 그리드로 ---------- */
  function buildFlip() {
    var sc = makeScene(), g = new THREE.Group(); sc.add(g);
    var COLORS = [0x2D6CDF, 0x22D3EE, 0x7C3AED, 0xE0218A];
    var pages = [], N = 26;
    var geo = new THREE.PlaneGeometry(2.7, 1.7); // 16:10 슬라이드 비율
    for (var i = 0; i < N; i++) {
      var col = COLORS[i % COLORS.length];
      var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 0.22,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.15
      }));
      var edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.35 }));
      m.add(edge);
      g.add(m);
      // 시작점: 왼쪽 흩어진 종이 더미 / 목표점: 오른쪽 4×N 정렬 그리드
      var col_i = Math.floor(i / 4), row_i = i % 4;
      pages.push({
        m: m, ph: Math.random() * 6.28,
        from: new THREE.Vector3(-26 + Math.random() * 9, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12),
        to: new THREE.Vector3(7 + col_i * 3.4, 6.5 - row_i * 2.6, (Math.random() - 0.5) * 1.4),
        sp: 0.35 + Math.random() * 0.4
      });
      m.position.copy(pages[i].from);
    }
    return {
      scene: sc, group: g,
      update: function (t) {
        pages.forEach(function (p, i) {
          // 0~1 왕복 진행: 흩어진 문서 → 정렬된 덱 (loop, 각자 위상 차)
          var k = (Math.sin(t * p.sp + p.ph) + 1) / 2;
          var e = k * k * (3 - 2 * k); // smoothstep
          p.m.position.lerpVectors(p.from, p.to, e);
          p.m.rotation.y = (1 - e) * Math.PI * 2.2 + Math.sin(t * 0.4 + i) * 0.05;
          p.m.rotation.x = (1 - e) * 0.8;
          p.m.material.opacity = 0.25 + e * 0.5;
        });
        g.rotation.y = Math.sin(t * 0.07) * 0.12;
      }
    };
  }

  /* ---------- 씬 3 · pipeline — 5단계 게이트를 지나는 입자 흐름 ---------- */
  function buildPipeline() {
    var sc = makeScene(), g = new THREE.Group(); sc.add(g);
    var GATES = [
      { x: -16, c: 0x2D6CDF }, { x: -8, c: 0x22A7E0 }, { x: 0, c: 0x22D3EE },
      { x: 8, c: 0x7C3AED }, { x: 16, c: 0xE0218A }
    ];
    GATES.forEach(function (gt) {
      var ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.09, 16, 64),
        new THREE.MeshStandardMaterial({ color: gt.c, emissive: gt.c, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }));
      ring.position.x = gt.x; ring.rotation.y = Math.PI / 2; g.add(ring);
    });
    var PN = 320;
    var pgeo = new THREE.BufferGeometry();
    var pos = new Float32Array(PN * 3), seed = [];
    for (var i = 0; i < PN; i++) {
      seed.push({ off: Math.random() * 40, r: 0.3 + Math.random() * 2.1, a: Math.random() * 6.28, sp: 2.6 + Math.random() * 2.6 });
    }
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var pts = new THREE.Points(pgeo, new THREE.PointsMaterial({
      color: 0x9BD8FF, size: 0.16, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    g.add(pts);
    return {
      scene: sc, group: g,
      update: function (t) {
        for (var i = 0; i < PN; i++) {
          var s = seed[i];
          var x = ((t * s.sp + s.off) % 40) - 20;            // -20 → +20 흐름
          var squeeze = 1;                                    // 게이트 근처에서 수렴
          for (var gI = 0; gI < GATES.length; gI++) {
            var d = Math.abs(x - GATES[gI].x);
            if (d < 2.2) squeeze = Math.min(squeeze, 0.32 + (d / 2.2) * 0.68);
          }
          var rr = s.r * squeeze;
          pos[i * 3] = x;
          pos[i * 3 + 1] = Math.cos(s.a + t * 0.7) * rr;
          pos[i * 3 + 2] = Math.sin(s.a + t * 0.7) * rr;
        }
        pgeo.attributes.position.needsUpdate = true;
        g.rotation.z = Math.sin(t * 0.1) * 0.06;
      }
    };
  }

  /* ---------- 씬 4 · globe — 점으로 이룬 지구 (글로벌 확장) ---------- */
  function buildGlobe() {
    var sc = makeScene(), g = new THREE.Group(); sc.add(g);
    var R = 10, N = 900;
    var geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var phi = Math.acos(1 - 2 * (i + 0.5) / N), th = Math.PI * (1 + Math.sqrt(5)) * i;
      pos[i * 3] = R * Math.sin(phi) * Math.cos(th);
      pos[i * 3 + 1] = R * Math.cos(phi);
      pos[i * 3 + 2] = R * Math.sin(phi) * Math.sin(th);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x7FB4FF, size: 0.13, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    })));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x0A1228, transparent: true, opacity: 0.55 })));
    // 한국 → 세계 아크
    var KOR = latLng(36.5, 127.8, R);
    var DEST = [[37.7, -122.4], [40.7, -74.0], [51.5, -0.1], [48.8, 2.3], [1.35, 103.8], [35.6, 139.7], [-33.8, 151.2]];
    DEST.forEach(function (d, idx) {
      var to = latLng(d[0], d[1], R);
      var mid = KOR.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.55);
      var curve = new THREE.QuadraticBezierCurve3(KOR, mid, to);
      var line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
        new THREE.LineBasicMaterial({ color: idx % 2 ? 0xE0218A : 0x22D3EE, transparent: true, opacity: 0.5 }));
      g.add(line);
    });
    var kdot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xE0218A }));
    kdot.position.copy(KOR); g.add(kdot);
    function latLng(lat, lng, r) {
      var la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
      return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
    }
    g.rotation.y = 2.2;
    return {
      scene: sc, group: g,
      update: function (t, dt) { g.rotation.y += dt * 0.12; g.rotation.x = Math.sin(t * 0.15) * 0.08; }
    };
  }

  /* ---------- 씬 5 · field — 콘텐츠 슬라이드용 저자극 별바다 ---------- */
  function buildField() {
    var sc = makeScene(), g = new THREE.Group(); sc.add(g);
    var N = 420, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40 - 8;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x4A5C8C, size: 0.11, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    })));
    return {
      scene: sc, group: g,
      update: function (t) { g.rotation.y = t * 0.008; g.rotation.x = Math.sin(t * 0.05) * 0.03; }
    };
  }

  var FACTORY = { gravity: buildGravity, flip: buildFlip, pipeline: buildPipeline, globe: buildGlobe, field: buildField };
  var TARGET_OPACITY = { gravity: 0.62, flip: 0.5, pipeline: 0.55, globe: 0.6, field: 0.34 };

  function getScene(name) {
    if (!FACTORY[name]) name = 'field';
    if (!scenes[name]) { try { scenes[name] = FACTORY[name](); } catch (e) { return null; } }
    return scenes[name];
  }

  /* ---------- 씬 매니저 API ---------- */
  var currentName = null;
  window.threeScene = {
    show: function (name) {
      if (!name) name = 'field';
      if (name === currentName) return;
      var next = getScene(name);
      if (!next) return;
      previous = current; current = next; currentName = name;
      fadeT = 0;
      canvas.style.opacity = TARGET_OPACITY[name] != null ? TARGET_OPACITY[name] : 0.45;
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; },
    renderOnce: function () { try { tick(performance.now(), true) } catch (e) {} }
  };

  /* ---------- 메인 루프 (rAF 먼저 예약, 본문 try/catch — §8-A) ---------- */
  var last = performance.now(), t0 = last;
  function tick(now, force) {
    if (!headless && !force) requestAnimationFrame(tick);
    if (paused && !force) return;
    try {
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      var t = (now - t0) / 1000;
      if (fadeT < 1) {
        fadeT = Math.min(1, fadeT + dt / FADE_SEC);
        if (current) setOpacity(current.group, fadeT);
        if (previous) setOpacity(previous.group, 1 - fadeT);
        if (fadeT >= 1) previous = null;
      }
      camera.position.x += (mouse.x * 5 - camera.position.x) * 0.04;
      camera.position.y += (2.5 - mouse.y * 3.5 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      if (current && current.update) current.update(t, dt);
      if (previous && previous.update) previous.update(t, dt);
      if (current) {
        renderer.autoClear = true;
        renderer.render(current.scene, camera);
        if (previous) { renderer.autoClear = false; renderer.render(previous.scene, camera); }
      }
    } catch (e) { /* 한 프레임 에러가 전체 루프를 얼리지 않게 */ }
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  addEventListener('pointermove', function (e) {
    mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  resize();
  window.threeScene.show('gravity');
  if (headless) { setOpacity(getScene('gravity').group, 1); fadeT = 1; tick(performance.now(), true); }
  else requestAnimationFrame(tick);
})();
