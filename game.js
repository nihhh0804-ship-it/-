const $ = s => document.querySelector(s);
const show = id => { document.querySelectorAll('.scr').forEach(e => e.classList.add('hidden')); $('#' + id).classList.remove('hidden'); };
const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const ip = () => `${r(11, 222)}.${r(0, 255)}.${r(0, 255)}.${r(1, 254)}`;
const other = x => x === 'hacker' ? 'defender' : 'hacker';
const DUR = 150;

let peer = null, conn = null, mode = '', me = '', s = null;
let tickTimer = null, aiTimer = null, cleanup = () => {}, ended = false, cur = -1;

/* ---------- 메뉴 ---------- */
$('#btnSolo').onclick = () => { $('#menuMain').classList.add('hidden'); $('#menuSolo').classList.remove('hidden'); };
$('#btnMulti').onclick = () => { $('#menuMain').classList.add('hidden'); $('#menuMulti').classList.remove('hidden'); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => {
  $('#menuSolo').classList.add('hidden'); $('#menuMulti').classList.add('hidden'); $('#menuMain').classList.remove('hidden');
});
document.querySelectorAll('[data-solo]').forEach(b => b.onclick = () => startGame(b.dataset.solo, 'solo'));
const toMenu = () => { location.href = location.pathname; };
$('#btnLeave').onclick = toMenu;
$('#btnMenu').onclick = toMenu;
$('#btnAgain').onclick = () => startGame(me, 'solo');

/* ---------- 온라인 연결 (PeerJS / WebRTC) ---------- */
const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CH[r(0, CH.length - 1)]).join('');

$('#btnCreate').onclick = createRoom;
function createRoom() {
  const code = makeCode();
  show('lobby');
  $('#lobbyTitle').textContent = '방 만들기';
  $('#lobbyMsg').textContent = '방을 여는 중...';
  peer = new Peer('hvd-' + code);
  peer.on('open', () => {
    const link = location.origin + location.pathname + '?room=' + code;
    $('#roomCode').textContent = code;
    $('#roomLink').value = link;
    $('#shareBox').classList.remove('hidden');
    $('#lobbyMsg').textContent = '상대가 링크로 들어오길 기다리는 중... ⏳';
  });
  peer.on('connection', c => {
    if (conn) { c.close(); return; }
    conn = c;
    c.on('open', () => {
      const hostRole = Math.random() < 0.5 ? 'hacker' : 'defender';
      c.send({ t: 'start', role: other(hostRole) });
      startGame(hostRole, 'host');
    });
    c.on('data', onData);
    c.on('close', onClose);
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); createRoom(); }
    else alert('연결 오류: ' + e.type);
  });
}
$('#btnCopy').onclick = () => {
  navigator.clipboard.writeText($('#roomLink').value).then(() => $('#btnCopy').textContent = '✅ 복사됨!');
};

$('#btnJoin').onclick = () => joinRoom($('#codeInput').value.trim().toUpperCase());
function joinRoom(code) {
  if (code.length !== 5) return alert('방 코드는 5자리예요.');
  show('lobby');
  $('#lobbyTitle').textContent = '방 참여';
  $('#lobbyMsg').textContent = `방 ${code}에 연결하는 중...`;
  $('#shareBox').classList.add('hidden');
  peer = new Peer();
  peer.on('open', () => {
    conn = peer.connect('hvd-' + code, { reliable: true });
    conn.on('open', () => { $('#lobbyMsg').textContent = '연결 완료! 게임이 곧 시작돼요...'; });
    conn.on('data', onData);
    conn.on('close', onClose);
    setTimeout(() => { if (!conn.open) { alert('방을 찾지 못했어요. 코드를 확인해 주세요.'); toMenu(); } }, 10000);
  });
  peer.on('error', e => { alert(e.type === 'peer-unavailable' ? '방을 찾을 수 없어요.' : '연결 오류: ' + e.type); toMenu(); });
}

function onData(d) {
  if (d.t === 'start') startGame(d.role, 'guest');
  else if (d.t === 'state') { s = d.s; render(); if (d.msg) addLog(d.msg); }
  else if (d.t === 'end') endGame(d.winner);
  else if (d.t === 'act' && mode === 'host') applyAct(other(me), d.k, d.v);
}
function onClose() {
  if (!ended) { alert('상대방과 연결이 끊겼어요.'); toMenu(); }
}

// 링크로 들어오면 자동 참여
const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) joinRoom(roomParam.toUpperCase());

/* ---------- 게임 상태 (방장/개인 플레이가 관리) ---------- */
function startGame(role, m) {
  clearInterval(tickTimer); clearInterval(aiTimer); cleanup();
  mode = m; me = role; ended = false;
  s = { breach: 0, trace: 0, shield: 0, time: DUR };
  show('game');
  $('#result').classList.add('hidden');
  $('#btnAgain').classList.toggle('hidden', m !== 'solo');
  $('#game').dataset.role = role;
  $('#roleLabel').textContent = role === 'hacker' ? '😈 HACKER — root@target-server' : '🛡️ DEFENDER — admin@secure-server';
  $('#log').innerHTML = '';
  $('#goals').innerHTML = (role === 'hacker'
    ? ['침투도 100% 달성 (방화벽 돌파)', '추적도가 100%가 되기 전에 끝내기', '방어막이 높으면 침투량이 줄어요!']
    : ['해커 추적도 100% 달성', '침투도가 100%가 되는 것 막기', '방어막(최대 Lv.3)으로 침투량 줄이기']
  ).map(t => `<li>${t}</li>`).join('');

  $('#appbar').innerHTML = '';
  APPS[role].forEach((a, i) => {
    const b = document.createElement('button');
    b.textContent = a.n; b.onclick = () => openApp(i);
    $('#appbar').appendChild(b);
  });
  openApp(0);
  render();

  if (m !== 'guest') tickTimer = setInterval(tick, 1000);
  if (m === 'solo') aiTimer = setInterval(aiMove, 5000);
}

function tick() {
  if (ended) return;
  s.time--;
  if (s.breach > 0) s.trace += 0.2;
  if (s.time % 20 === 0 && s.shield > 0) s.shield--;
  sync(); check();
}

function applyAct(role, k, v) {
  if (ended) return;
  v = Math.max(0, Math.min(+v || 0, 30));
  let msg = '';
  if (role === 'hacker' && k === 'breach') {
    const g = Math.round(v * (1 - 0.2 * s.shield));
    s.breach += g; s.trace += 1;
    msg = `😈 침투 +${g}%` + (s.shield ? ` (방어막이 ${s.shield * 20}% 줄임)` : '');
  } else if (role === 'defender' && k === 'trace') {
    s.trace += v; msg = `🔍 추적 +${v}%`;
  } else if (role === 'defender' && k === 'block') {
    s.breach -= v; s.trace += v / 2; msg = `🛡️ 패킷 차단! 침투 -${v}%`;
  } else if (role === 'defender' && k === 'shield') {
    s.shield = Math.min(3, s.shield + 1); msg = `🔧 방어막 Lv.${s.shield}`;
  }
  s.breach = Math.max(0, s.breach);
  sync(msg); check();
}

function sync(msg) {
  s.breach = Math.min(100, s.breach); s.trace = Math.min(100, s.trace);
  render();
  if (msg) addLog(msg);
  if (mode === 'host' && conn && conn.open) conn.send({ t: 'state', s, msg });
}

function check() {
  if (ended) return;
  let w = null;
  if (s.breach >= 100) w = 'hacker';
  else if (s.trace >= 100) w = 'defender';
  else if (s.time <= 0) w = s.breach >= s.trace ? 'hacker' : 'defender';
  if (w) {
    if (mode === 'host' && conn && conn.open) conn.send({ t: 'end', winner: w });
    endGame(w);
  }
}

function endGame(w) {
  ended = true;
  clearInterval(tickTimer); clearInterval(aiTimer); cleanup();
  const win = w === me;
  $('#resTitle').textContent = win ? '🏆 승리!' : '💀 패배...';
  $('#resTitle').style.color = win ? '#39ff8a' : '#ff6b81';
  $('#resSub').textContent = w === 'hacker' ? '해커가 시스템을 장악했습니다.' : '방어자가 침입자를 잡았습니다.';
  $('#result').classList.remove('hidden');
}

function act(k, v) {
  if (mode === 'guest') conn.send({ t: 'act', k, v });
  else applyAct(me, k, v);
}

function aiMove() {
  if (me === 'defender') applyAct('hacker', 'breach', r(3, 6));
  else {
    applyAct('defender', 'trace', r(2, 4));
    if (Math.random() < 0.3) applyAct('defender', 'shield', 0);
    if (Math.random() < 0.3) applyAct('defender', 'block', 2);
  }
}

/* ---------- 화면 갱신 ---------- */
function render() {
  $('#bBreach').style.width = s.breach + '%';
  $('#bTrace').style.width = s.trace + '%';
  $('#vBreach').textContent = Math.round(s.breach) + '%';
  $('#vTrace').textContent = Math.round(s.trace) + '%';
  $('#vShield').textContent = '🛡'.repeat(s.shield) + '·'.repeat(3 - s.shield) + ` Lv.${s.shield}`;
  const t = Math.max(0, s.time);
  $('#timer').textContent = `⏱ ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
function addLog(m) {
  const d = document.createElement('div');
  d.textContent = '> ' + m;
  $('#log').prepend(d);
  while ($('#log').children.length > 30) $('#log').lastChild.remove();
}

/* ---------- 미니게임 공통 ---------- */
function openApp(i) {
  cleanup();
  cur = i;
  document.querySelectorAll('#appbar button').forEach((b, j) => b.classList.toggle('on', j === i));
  const w = $('#window'); w.innerHTML = '';
  const finish = (ok, k, v, text) => {
    if (ok) act(k, v);
    w.innerHTML = `<div class="res ${ok ? 'ok' : 'bad'}">${text}</div>`;
    const t = setTimeout(() => { if (cur === i && !ended) openApp(i); }, 1200);
    cleanup = () => clearTimeout(t);
  };
  cleanup = APPS[me][i].f(w, finish) || (() => {});
}

function timerBar(w, sec, onEnd) {
  const b = document.createElement('div');
  b.className = 'tbar'; b.innerHTML = '<i></i>'; w.appendChild(b);
  const i = b.firstChild;
  i.style.transition = `width ${sec}s linear`;
  requestAnimationFrame(() => requestAnimationFrame(() => i.style.width = '0%'));
  const t = setTimeout(onEnd, sec * 1000);
  return () => clearTimeout(t);
}

function typing(w, finish, o) {
  w.innerHTML = `<h3>${o.title}</h3><div class="target" id="tg">${o.target}</div><input id="ti" autocomplete="off" spellcheck="false" placeholder="입력 후 Enter">`;
  const tg = w.querySelector('#tg'), ti = w.querySelector('#ti');
  ti.focus();
  const hid = o.hide ? setTimeout(() => tg.textContent = '● ● ● ● ● ●', o.hide * 1000) : null;
  const stopBar = timerBar(w, o.sec, () => finish(false, o.k, 0, '⏱ 시간 초과!'));
  ti.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (ti.value.trim().toLowerCase() === o.target.toLowerCase()) {
      clearTimeout(hid); stopBar();
      finish(true, o.k, o.v, o.ok);
    } else {
      ti.value = ''; ti.classList.remove('shake'); void ti.offsetWidth; ti.classList.add('shake');
    }
  });
  return () => { clearTimeout(hid); stopBar(); };
}

/* ---------- 해커 미니게임 ---------- */
function gCrack(w, finish) {
  const code = Array.from({ length: 6 }, () => '0123456789ABCDEF'[r(0, 15)]).join('');
  return typing(w, finish, { title: '🔑 비밀번호 해독 — 코드를 외워서 입력하세요 (2.5초 뒤 사라져요!)', target: code, sec: 10, hide: 2.5, k: 'breach', v: 12, ok: '✅ 해독 성공! 침투 +12%' });
}
function gInject(w, finish) {
  const cmds = ['inject --payload alpha', 'bypass --firewall 443', 'exploit --target db01', 'escalate --user root', 'dump --table users'];
  return typing(w, finish, { title: '💉 코드 인젝션 — 명령어를 정확히 입력하세요', target: cmds[r(0, cmds.length - 1)], sec: 12, k: 'breach', v: 10, ok: '✅ 주입 성공! 침투 +10%' });
}
function gScan(w, finish) {
  const vuln = new Set();
  while (vuln.size < 3) vuln.add(r(0, 15));
  const ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 5432, 8080, 8443, 9200];
  let clicks = 0, found = 0;
  w.innerHTML = `<h3>📡 포트 스캔 — 취약한 포트 3개를 찾으세요 (클릭 10번)</h3><div class="grid" id="gr"></div><p id="info">남은 클릭 10 · 발견 0/3</p>`;
  const gr = w.querySelector('#gr'), info = w.querySelector('#info');
  ports.forEach((p, i) => {
    const c = document.createElement('button');
    c.className = 'cell'; c.textContent = ':' + p;
    c.onclick = () => {
      if (c.disabled) return;
      c.disabled = true; clicks++;
      if (vuln.has(i)) { found++; c.classList.add('hit'); c.textContent += ' ✔'; } else c.classList.add('miss');
      info.textContent = `남은 클릭 ${10 - clicks} · 발견 ${found}/3`;
      if (found === 3) finish(true, 'breach', 15, '✅ 취약점 발견! 침투 +15%');
      else if (clicks >= 10) finish(false, 'breach', 0, '❌ 스캔 실패');
    };
    gr.appendChild(c);
  });
}

/* ---------- 방어자 미니게임 ---------- */
function gPatch(w, finish) {
  return typing(w, finish, { title: '🔧 패치 적용 — 명령어를 입력해 방어막을 강화하세요', target: `sudo patch --id ${r(1000, 9999)}`, sec: 10, k: 'shield', v: 1, ok: '✅ 패치 완료! 방어막 +1' });
}
function gBlock(w, finish) {
  w.innerHTML = `<h3>🛡️ 패킷 차단 — 빨간 악성 패킷만 클릭! (12초)</h3><div class="sky" id="sky"></div><p id="info" style="margin:6px 0 0">차단 0</p>`;
  const sky = w.querySelector('#sky'), info = w.querySelector('#info');
  let n = 0;
  const sp = setInterval(() => {
    const bad = Math.random() < 0.6;
    const p = document.createElement('div');
    p.className = 'pkt ' + (bad ? 'bad' : 'good');
    p.textContent = (bad ? '☠ ' : '✉ ') + ip();
    p.style.left = r(0, 70) + '%';
    p.onclick = () => {
      if (p.dataset.x) return; p.dataset.x = 1;
      if (bad) { n++; p.remove(); }
      else { n = Math.max(0, n - 1); p.classList.add('oops'); setTimeout(() => p.remove(), 200); }
      info.textContent = '차단 ' + n;
    };
    p.addEventListener('animationend', () => p.remove());
    sky.appendChild(p);
  }, 450);
  const stop = timerBar(w, 12, () => {
    clearInterval(sp);
    const v = Math.min(n * 2, 24);
    n > 0 ? finish(true, 'block', v, `✅ ${n}개 차단! 침투 -${v}%`) : finish(false, 'block', 0, '❌ 차단 실패');
  });
  return () => { clearInterval(sp); stop(); };
}
function gLog(w, finish) {
  const normal = ['GET /index.html 200 OK from 192.168.0.12', 'User kim logged in (192.168.0.31)', 'Backup completed successfully', 'GET /logo.png 200 OK from 192.168.0.45', 'DNS query school.local resolved', 'Cron job update-check finished', 'Printer spooler started']
    .sort(() => Math.random() - 0.5).slice(0, 5);
  const sus = [`Failed login x${r(30, 99)} for root from ${ip()}`, 'Unknown process "xmrig" started by www-data', `Large upload ${r(2, 9)}GB to ${ip()}`, `Port scan detected from ${ip()}`, `Admin password changed at 03:${r(10, 59)} from ${ip()}`];
  const lines = normal.map(t => ({ t, bad: false }));
  lines.splice(r(0, lines.length), 0, { t: sus[r(0, sus.length - 1)], bad: true });
  let tries = 2;
  w.innerHTML = '<h3>🔍 로그 분석 — 수상한 로그 1개를 찾으세요 (기회 2번)</h3>';
  lines.forEach(l => {
    const b = document.createElement('button');
    b.className = 'logline'; b.textContent = l.t;
    b.onclick = () => {
      if (l.bad) finish(true, 'trace', 10, '✅ 침입자 흔적 발견! 추적 +10%');
      else { b.classList.add('wrong'); b.disabled = true; if (--tries <= 0) finish(false, 'trace', 0, '❌ 놓쳤어요...'); }
    };
    w.appendChild(b);
  });
}

const APPS = {
  hacker: [{ n: '🔑 비밀번호 해독', f: gCrack }, { n: '📡 포트 스캔', f: gScan }, { n: '💉 코드 인젝션', f: gInject }],
  defender: [{ n: '🛡️ 패킷 차단', f: gBlock }, { n: '🔧 패치 적용', f: gPatch }, { n: '🔍 로그 분석', f: gLog }]
};
