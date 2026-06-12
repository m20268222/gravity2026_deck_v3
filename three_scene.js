/* ============================================================
   복순도가 v7 — 3D 배경 (Three.js r128 UMD)
   옹기 항아리 + 누룩 입자 + 떠오르는 탄산 기포
   - 단일 persistent 캔버스, 표지/디바이더/빅아이디어에서만 표시
   - HeadlessChrome: 1프레임만 렌더 (PDF 인쇄 블로킹 방지)
   - rAF 선예약 + try/catch (한 프레임 에러가 루프를 멈추지 않게)
   ============================================================ */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;

  var container = document.getElementById('bg3d');
  if (!container) return;

  var IS_HEADLESS = navigator.userAgent.includes('HeadlessChrome');
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var renderer, scene, camera, group, bubbles, particles;
  var mouseX = 0, mouseY = 0;
  var running = false;

  function init() {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0.6, 9);

    group = new THREE.Group();
    scene.add(group);

    // ---- 옹기 항아리 (LatheGeometry) ----
    var pts = [];
    var profile = [
      [0.02, -1.7], [0.85, -1.62], [1.3, -1.2], [1.52, -0.5],
      [1.5, 0.2], [1.28, 0.9], [0.95, 1.35], [0.78, 1.52],
      [0.82, 1.62], [0.95, 1.7]
    ];
    for (var i = 0; i < profile.length; i++) {
      pts.push(new THREE.Vector2(profile[i][0], profile[i][1]));
    }
    var JAR_X = 4.7, JAR_Y = -1.5, JAR_S = 0.95;
    var ongiGeo = new THREE.LatheGeometry(pts, 48);
    var ongiMat = new THREE.MeshStandardMaterial({
      color: 0x7a5c3e, roughness: 0.85, metalness: 0.04,
      transparent: true, opacity: 0.8
    });
    var ongi = new THREE.Mesh(ongiGeo, ongiMat);
    ongi.position.set(JAR_X, JAR_Y, 0);
    ongi.scale.setScalar(JAR_S);
    group.add(ongi);

    // 옹기 입 둘레 림
    var rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.95 * JAR_S, 0.065, 14, 48),
      new THREE.MeshStandardMaterial({ color: 0xa9854b, roughness: 0.5, metalness: 0.3 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(JAR_X, JAR_Y + 1.7 * JAR_S, 0);
    group.add(rim);

    // ---- 누룩 입자 (떠다니는 골드 더스트) ----
    var pGeo = new THREE.BufferGeometry();
    var COUNT = 320;
    var pos = new Float32Array(COUNT * 3);
    for (var p = 0; p < COUNT; p++) {
      pos[p * 3] = (Math.random() - 0.5) * 18;
      pos[p * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[p * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: 0xc6ab7c, size: 0.045, transparent: true, opacity: 0.55,
      depthWrite: false
    }));
    scene.add(particles);

    // ---- 탄산 기포 (옹기에서 떠오름) ----
    var bGeo = new THREE.BufferGeometry();
    var BCOUNT = 90;
    var bpos = new Float32Array(BCOUNT * 3);
    var bdata = [];
    for (var b = 0; b < BCOUNT; b++) {
      var bx = JAR_X + (Math.random() - 0.5) * 1.3;
      var by = (JAR_Y + 1.7 * JAR_S) + Math.random() * 5;
      var bz = (Math.random() - 0.5) * 1.2;
      bpos[b * 3] = bx; bpos[b * 3 + 1] = by; bpos[b * 3 + 2] = bz;
      bdata.push({ speed: 0.004 + Math.random() * 0.012, x0: bx, amp: 0.12 + Math.random() * 0.25, ph: Math.random() * 6.28 });
    }
    bGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    bubbles = new THREE.Points(bGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.075, transparent: true, opacity: 0.8,
      depthWrite: false
    }));
    scene.add(bubbles);

    // ---- 조명 (밝은 종이 배경용) ----
    scene.add(new THREE.AmbientLight(0xfff6e6, 0.85));
    var key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(-4, 6, 8);
    scene.add(key);
    var warm = new THREE.PointLight(0xc6ab7c, 0.8, 30);
    warm.position.set(5, 3, 4);
    scene.add(warm);

    window.addEventListener('resize', onResize);
    document.addEventListener('mousemove', function (e) {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });
  }

  function onResize() {
    if (!renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  var t = 0;
  function tick() {
    if (running) requestAnimationFrame(tick);   // 루프 선예약
    try {
      t += 0.008;
      group.rotation.y += 0.0022;               // 느린 자전
      group.rotation.y += (mouseX * 0.18 - group.rotation.x) * 0.0008;
      group.position.y = Math.sin(t * 0.9) * 0.08;
      particles.rotation.y += 0.0006;

      var bp = bubbles.geometry.attributes.position;
      var Y0 = -1.5 + 1.7 * 0.95;
      for (var i = 0; i < bp.count; i++) {
        var d = bubbleData(i);
        var y = bp.getY(i) + d.speed;
        if (y > Y0 + 5.2) y = Y0;
        bp.setY(i, y);
        bp.setX(i, d.x0 + Math.sin(t * 2 + d.ph) * d.amp * ((y - Y0) / 5));
      }
      bp.needsUpdate = true;

      camera.position.x += (mouseX * 0.4 - camera.position.x) * 0.02;
      camera.position.y += (0.6 - mouseY * 0.3 - camera.position.y) * 0.02;
      camera.lookAt(1.4, 0.2, 0);
      renderer.render(scene, camera);
    } catch (e) { /* 한 프레임 에러 무시 — 루프 유지 */ }
  }

  var _bdata = null;
  function bubbleData(i) {
    if (!_bdata) {
      _bdata = [];
      var bp = bubbles.geometry.attributes.position;
      for (var k = 0; k < bp.count; k++) {
        _bdata.push({ speed: 0.004 + Math.random() * 0.012, x0: bp.getX(k), amp: 0.12 + Math.random() * 0.25, ph: Math.random() * 6.28 });
      }
    }
    return _bdata[i];
  }

  window.threeScene = {
    show: function () {
      container.classList.add('on');
      if (!running && !IS_HEADLESS && !REDUCED) { running = true; tick(); }
    },
    hide: function () {
      container.classList.remove('on');
    },
    pause: function () { running = false; },
    renderOnce: function () {
      try { renderer.render(scene, camera); } catch (e) {}
    }
  };

  try {
    init();
    if (IS_HEADLESS || REDUCED) {
      // 헤드리스/모션 최소화: 1프레임만 렌더, 루프 없음
      window.threeScene.renderOnce();
    }
  } catch (e) { /* WebGL 미지원 환경 — 3D 없이 진행 */ }
})();
