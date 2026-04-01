// ═══════════════════════════════════════════
//  いぬそだて  Dog Raising Game
// ═══════════════════════════════════════════

const TICK_MS    = 2000;
const DAY_TICKS  = 5;      // 5 ticks × 2s = 10s per game day
const SAVE_KEY   = 'inusodate_v4';
const HISTORY_KEY = 'inusodate_history_v1';
const MAX_HISTORY = 5;

// Seasons cycle every 2 game days → all 4 seasons visible within every stage
const SEASONS      = ['spring','summer','autumn','winter'];
const SEASON_DAYS  = 2;
const SEASON_LABEL = { spring:'🌸 春', summer:'☀️ 夏', autumn:'🍂 秋', winter:'❄️ 冬' };
const SEASON_FLOWERS = {
  spring: ['🌸','🌷','🌼','🌸','🌺','🌼','🌷','🌸'],
  summer: ['🌻','🌺','🌹','🌼','🌻','💐','🌺','🌻'],
  autumn: ['🍄','🌾','🍁','🌾','🍄','🌾','🍁','🌾'],
  winter: ['⛄','❄️','🌨️','⛄','❄️','🌨️','⛄','❄️'],
};
const SEASON_PARTICLES = {
  spring: { chars:['🌸','🌸','🌷'], ms:700 },
  summer: null,
  autumn: { chars:['🍂','🍁','🍂'], ms:500 },
  winter: { chars:['❄️','❄️','🌨️'], ms:400 },
};

// Each stage spans 8+ game days so all 4 seasons (2 days each) appear within it
const STAGES = [
  { name:'赤ちゃん犬', ageDay:0,  icon:'🐾' },  // 0–7   (8 days)
  { name:'子犬',       ageDay:8,  icon:'🐶' },  // 8–19  (12 days)
  { name:'若犬',       ageDay:20, icon:'🐕' },  // 20–35 (16 days)
  { name:'成犬',       ageDay:36, icon:'🦮' },  // 36–55 (20 days)
  { name:'老犬',       ageDay:56, icon:'🐕‍🦺' }, // 56+
];

const CARE_TYPES = {
  gourmet: { label:'🍖 グルメ犬',    accIcon:'🍖' },
  athlete: { label:'🏃 アスリート犬', accIcon:'⚡' },
  wild:    { label:'🐺 ワイルド犬',   accIcon:'🌿' },
  poor:    { label:'😢 プア犬',       accIcon:'💧' },
  unknown: { label:'❓ ???',          accIcon:''    },
};

const SHOP_ITEMS = {
  hat:        { name:'帽子',       icon:'🎩', cost:50  },
  scarf:      { name:'マフラー',   icon:'🧣', cost:80  },
  sunglasses: { name:'サングラス', icon:'🕶️', cost:120 },
};

const COOLDOWNS = { feed:4000, play:7000, bath:7000, sleep:9000 };

// ── State ──────────────────────────────────
let state = defaultState();
function defaultState() {
  return {
    hunger:70, happiness:70, clean:70, energy:70,
    age:0, tickInDay:0,
    points:0,
    feedCount:0, playCount:0, bathCount:0, sleepCount:0,
    careType:'unknown', stage:0,
    equippedItem:null, inventory:{},
    snapshots:{}, bestHappiness:{},
    lastSave: Date.now(),
  };
}

// ── Save / Load ─────────────────────────────
function saveState() {
  state.lastSave = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const elapsed = (Date.now() - (saved.lastSave || Date.now())) / 1000;
    const decayDays = elapsed / (TICK_MS * DAY_TICKS / 1000);
    saved.hunger    = Math.max(0, saved.hunger    - decayDays * 8);
    saved.happiness = Math.max(0, saved.happiness - decayDays * 6);
    saved.clean     = Math.max(0, saved.clean     - decayDays * 5);
    saved.energy    = Math.max(0, saved.energy    - decayDays * 4);
    state = { ...defaultState(), ...saved };
  } catch(e) { console.warn('load failed', e); }
}

// ── Cooldowns ──────────────────────────────
const cdEnd = { feed:0, play:0, bath:0, sleep:0 };

// ── Pause ──────────────────────────────────
let gameIntervalId = null;
let isPaused = false;

function togglePause() {
  isPaused = !isPaused;
  if (isPaused) {
    clearInterval(gameIntervalId);
    gameIntervalId = null;
  } else {
    gameIntervalId = setInterval(gameTick, TICK_MS);
  }
  const btn = document.getElementById('pause-btn');
  if (btn) btn.textContent = isPaused ? '▶ 再開' : '⏸ 一時停止';
  const gc = document.getElementById('game-card');
  if (gc) gc.classList.toggle('paused', isPaused);
}

// ── Season ─────────────────────────────────
let currentSeason = '';
let particleTimer = null;

function getSeasonName() {
  return SEASONS[Math.floor(state.age / SEASON_DAYS) % 4];
}

function applyGarden() {
  const season = getSeasonName();
  if (season === currentSeason) return;
  currentSeason = season;

  const html = document.documentElement;
  html.className = html.className.replace(/season-\w+/g,'').trim() + ` season-${season}`;

  const row = document.getElementById('g-flower-row');
  if (row) row.textContent = SEASON_FLOWERS[season].join(' ');

  clearInterval(particleTimer); particleTimer = null;
  const pEl = document.getElementById('g-particles');
  if (pEl) pEl.innerHTML = '';
  const pc = SEASON_PARTICLES[season];
  if (pc) particleTimer = setInterval(() => spawnParticle(pEl, pc.chars), pc.ms);

  const lbl = document.getElementById('g-season-label');
  if (lbl) {
    lbl.textContent = SEASON_LABEL[season];
    lbl.style.opacity = '1';
    setTimeout(() => { lbl.style.opacity = '0'; }, 3000);
  }
  const badge = document.getElementById('season-badge');
  if (badge) badge.textContent = SEASON_LABEL[season];
}

function spawnParticle(container, chars) {
  if (!container) return;
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:${Math.random()*100}%;top:-20px;font-size:${12+Math.random()*8}px;pointer-events:none;animation:gardenFall ${3+Math.random()*3}s linear forwards;`;
  el.textContent = chars[Math.floor(Math.random()*chars.length)];
  container.appendChild(el);
  setTimeout(() => el.remove(), 6500);
}

const kf = document.createElement('style');
kf.textContent = `@keyframes gardenFall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(105vh) rotate(360deg);opacity:.2}}`;
document.head.appendChild(kf);

// ── Stage & Type ───────────────────────────
function computeStage() {
  let s = 0;
  for (let i = STAGES.length-1; i >= 0; i--) {
    if (state.age >= STAGES[i].ageDay) { s = i; break; }
  }
  return s;
}

function computeCareType() {
  const { feedCount, playCount, bathCount, sleepCount } = state;
  const total = feedCount + playCount + bathCount + sleepCount;
  if (total < 4) return 'unknown';
  const avg = (state.hunger + state.happiness + state.clean + state.energy) / 4;
  if (avg < 30) return 'poor';
  const max = Math.max(feedCount, playCount, sleepCount);
  if (feedCount >= max) return 'gourmet';
  if (playCount >= max) return 'athlete';
  return 'wild';
}

function getMood() {
  if (state.happiness >= 70) return 'happy';
  if (state.happiness < 30)  return 'sad';
  return 'neutral';
}

// ── Points: always earn something per action ──
function calcPoints(action) {
  switch(action) {
    case 'feed':  return state.hunger    < 30 ? 15 : state.hunger    < 60 ? 8 : 3;
    case 'play':  return state.happiness < 30 ? 18 : state.happiness < 60 ? 10 : 4;
    case 'bath':  return state.clean     < 30 ? 12 : state.clean     < 60 ? 7 : 3;
    case 'sleep': return state.energy    < 30 ? 10 : state.energy    < 60 ? 6 : 2;
  }
  return 0;
}

// ── Actions ────────────────────────────────
function doAction(type) {
  if (isPaused) return;
  const now = Date.now();
  if (cdEnd[type] > now) return;
  cdEnd[type] = now + COOLDOWNS[type];

  const pts = calcPoints(type);
  state.points += pts;

  switch(type) {
    case 'feed':
      state.hunger    = Math.min(100, state.hunger    + 22);
      state.happiness = Math.min(100, state.happiness + 5);
      state.feedCount++;
      break;
    case 'play':
      state.happiness = Math.min(100, state.happiness + 20);
      state.energy    = Math.max(0,   state.energy    - 12);
      state.hunger    = Math.max(0,   state.hunger    - 6);
      state.playCount++;
      break;
    case 'bath':
      state.clean     = Math.min(100, state.clean     + 25);
      state.happiness = Math.min(100, state.happiness + 6);
      state.bathCount++;
      break;
    case 'sleep':
      state.energy    = Math.min(100, state.energy    + 30);
      state.happiness = Math.min(100, state.happiness + 4);
      state.sleepCount++;
      showZzz();
      break;
  }

  showToast(`+${pts}pt ⭐`);
  popDog();
  state.careType = computeCareType();
  checkAndCaptureSnapshot();
  render();
  saveState();
}

function showZzz() {
  const el = document.getElementById('d-zzz');
  if (!el) return;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2200);
}

function popDog() {
  const pet = document.getElementById('pet');
  if (!pet) return;
  pet.style.animation = 'none';
  requestAnimationFrame(() => {
    pet.style.animation = 'actionPop .5s ease-out';
    setTimeout(() => { pet.style.animation = ''; }, 550);
  });
}

// ── Shop ───────────────────────────────────
function buyItem(key) {
  const item = SHOP_ITEMS[key];
  if (!item) return;
  if (state.inventory[key]) {
    state.equippedItem = (state.equippedItem === key) ? null : key;
    showToast(state.equippedItem === key ? `${item.icon} 装備した！` : `${item.icon} 外した`);
  } else {
    if (state.points < item.cost) { showToast('ポイントが足りない！'); return; }
    state.points -= item.cost;
    state.inventory[key] = true;
    state.equippedItem = key;
    showToast(`${item.icon} ${item.name}をプレゼント！`);
  }
  render(); saveState();
}

// ── Game Tick ──────────────────────────────
let tickCount = 0;
function gameTick() {
  state.hunger    = Math.max(0, state.hunger    - 1.8);
  state.happiness = Math.max(0, state.happiness - 1.4);
  state.clean     = Math.max(0, state.clean     - 1.2);
  state.energy    = Math.max(0, state.energy    - 1.0);

  tickCount++;
  state.tickInDay = (state.tickInDay || 0) + 1;
  if (state.tickInDay >= DAY_TICKS) {
    state.tickInDay = 0;
    state.age++;
  }

  state.stage    = computeStage();
  state.careType = computeCareType();
  checkAndCaptureSnapshot();
  applyGarden();
  render();
  if (tickCount % 5 === 0) saveState();
}

// ── History ─────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function saveToHistory() {
  const snaps = state.snapshots || {};
  if (Object.keys(snaps).length === 0) return;
  let history = loadHistory();
  history.unshift({
    id: Date.now(),
    finalAge: state.age,
    finalStage: state.stage,
    careType: state.careType || 'unknown',
    snapshots: JSON.parse(JSON.stringify(snaps)),
    savedAt: Date.now(),
  });
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function startNewGame() {
  if (!confirm('現在のゲームを保存して\n新しいゲームを始めますか？')) return;
  saveToHistory();
  clearInterval(gameIntervalId);
  gameIntervalId = null;
  isPaused = false;
  currentSeason = '';
  clearInterval(particleTimer); particleTimer = null;
  state = defaultState();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  state.stage    = computeStage();
  state.careType = computeCareType();
  applyGarden();
  renderPhotoStrip();
  render();
  const btn = document.getElementById('pause-btn');
  if (btn) btn.textContent = '⏸ 一時停止';
  gameIntervalId = setInterval(gameTick, TICK_MS);
  showToast('新しいゲームを始めたよ！');
}

// Dummy history data for testing (injected only when history is empty)
const DUMMY_HISTORY = [
  {
    id: 1, finalAge:62, finalStage:4, careType:'gourmet', savedAt: Date.now() - 5*86400000,
    snapshots:{
      0:{ stage:0,stageName:'赤ちゃん犬',stageIcon:'🐾',type:'unknown', mood:'happy',  accIcon:'',   equippedItem:null,  happiness:82,day:3, season:'spring',rotate:-3.1,isNew:false },
      1:{ stage:1,stageName:'子犬',      stageIcon:'🐶',type:'gourmet', mood:'happy',  accIcon:'🍖', equippedItem:null,  happiness:88,day:11,season:'summer',rotate: 4.2,isNew:false },
      2:{ stage:2,stageName:'若犬',      stageIcon:'🐕',type:'gourmet', mood:'happy',  accIcon:'🍖', equippedItem:'hat', happiness:90,day:22,season:'autumn',rotate:-1.5,isNew:false },
      3:{ stage:3,stageName:'成犬',      stageIcon:'🦮',type:'gourmet', mood:'happy',  accIcon:'🍖', equippedItem:'hat', happiness:93,day:38,season:'winter',rotate: 2.8,isNew:false },
      4:{ stage:4,stageName:'老犬',      stageIcon:'🐕‍🦺',type:'gourmet',mood:'neutral',accIcon:'🍖',equippedItem:'hat', happiness:76,day:62,season:'spring',rotate:-4.0,isNew:false },
    },
  },
  {
    id: 2, finalAge:65, finalStage:4, careType:'athlete', savedAt: Date.now() - 12*86400000,
    snapshots:{
      0:{ stage:0,stageName:'赤ちゃん犬',stageIcon:'🐾',type:'unknown', mood:'happy',  accIcon:'',   equippedItem:null,   happiness:79,day:2, season:'summer',rotate: 2.0,isNew:false },
      1:{ stage:1,stageName:'子犬',      stageIcon:'🐶',type:'athlete', mood:'happy',  accIcon:'⚡', equippedItem:null,   happiness:91,day:10,season:'autumn',rotate:-3.5,isNew:false },
      2:{ stage:2,stageName:'若犬',      stageIcon:'🐕',type:'athlete', mood:'happy',  accIcon:'⚡', equippedItem:null,   happiness:87,day:21,season:'winter',rotate: 1.8,isNew:false },
      3:{ stage:3,stageName:'成犬',      stageIcon:'🦮',type:'athlete', mood:'happy',  accIcon:'⚡', equippedItem:'scarf',happiness:94,day:37,season:'spring',rotate:-2.2,isNew:false },
      4:{ stage:4,stageName:'老犬',      stageIcon:'🐕‍🦺',type:'athlete',mood:'neutral',accIcon:'⚡',equippedItem:'scarf',happiness:80,day:65,season:'summer',rotate: 3.5,isNew:false },
    },
  },
  {
    id: 3, finalAge:70, finalStage:4, careType:'wild', savedAt: Date.now() - 20*86400000,
    snapshots:{
      0:{ stage:0,stageName:'赤ちゃん犬',stageIcon:'🐾',type:'unknown',mood:'happy',  accIcon:'',   equippedItem:null,happiness:80,day:4, season:'autumn',rotate: 3.5,isNew:false },
      1:{ stage:1,stageName:'子犬',      stageIcon:'🐶',type:'wild',   mood:'happy',  accIcon:'🌿', equippedItem:null,happiness:86,day:13,season:'winter',rotate:-1.0,isNew:false },
      2:{ stage:2,stageName:'若犬',      stageIcon:'🐕',type:'wild',   mood:'happy',  accIcon:'🌿', equippedItem:null,happiness:83,day:24,season:'spring',rotate: 4.8,isNew:false },
      3:{ stage:3,stageName:'成犬',      stageIcon:'🦮',type:'wild',   mood:'happy',  accIcon:'🌿', equippedItem:null,happiness:89,day:40,season:'summer',rotate:-2.0,isNew:false },
      4:{ stage:4,stageName:'老犬',      stageIcon:'🐕‍🦺',type:'wild',  mood:'neutral',accIcon:'🌿',equippedItem:null,happiness:74,day:70,season:'autumn',rotate: 1.3,isNew:false },
    },
  },
  {
    id: 4, finalAge:68, finalStage:4, careType:'poor', savedAt: Date.now() - 30*86400000,
    snapshots:{
      0:{ stage:0,stageName:'赤ちゃん犬',stageIcon:'🐾',type:'unknown',mood:'neutral',accIcon:'',   equippedItem:null,       happiness:73,day:5, season:'winter',rotate:-2.5,isNew:false },
      1:{ stage:1,stageName:'子犬',      stageIcon:'🐶',type:'poor',   mood:'sad',    accIcon:'💧', equippedItem:null,       happiness:72,day:14,season:'spring',rotate: 3.0,isNew:false },
      2:{ stage:2,stageName:'若犬',      stageIcon:'🐕',type:'poor',   mood:'sad',    accIcon:'💧', equippedItem:null,       happiness:74,day:25,season:'summer',rotate:-1.8,isNew:false },
      3:{ stage:3,stageName:'成犬',      stageIcon:'🦮',type:'poor',   mood:'neutral',accIcon:'💧', equippedItem:null,       happiness:75,day:42,season:'autumn',rotate: 2.1,isNew:false },
      4:{ stage:4,stageName:'老犬',      stageIcon:'🐕‍🦺',type:'poor',  mood:'sad',    accIcon:'💧', equippedItem:null,       happiness:72,day:68,season:'winter',rotate:-3.2,isNew:false },
    },
  },
  {
    id: 5, finalAge:60, finalStage:4, careType:'athlete', savedAt: Date.now() - 40*86400000,
    snapshots:{
      0:{ stage:0,stageName:'赤ちゃん犬',stageIcon:'🐾',type:'unknown', mood:'happy', accIcon:'',   equippedItem:null,       happiness:85,day:1, season:'spring',rotate: 1.2,isNew:false },
      1:{ stage:1,stageName:'子犬',      stageIcon:'🐶',type:'athlete', mood:'happy', accIcon:'⚡', equippedItem:null,       happiness:89,day:9, season:'summer',rotate:-4.1,isNew:false },
      2:{ stage:2,stageName:'若犬',      stageIcon:'🐕',type:'athlete', mood:'happy', accIcon:'⚡', equippedItem:'sunglasses',happiness:92,day:20,season:'autumn',rotate: 2.3,isNew:false },
      3:{ stage:3,stageName:'成犬',      stageIcon:'🦮',type:'athlete', mood:'happy', accIcon:'⚡', equippedItem:'sunglasses',happiness:96,day:36,season:'winter',rotate:-3.8,isNew:false },
      4:{ stage:4,stageName:'老犬',      stageIcon:'🐕‍🦺',type:'athlete',mood:'neutral',accIcon:'⚡',equippedItem:'sunglasses',happiness:81,day:60,season:'spring',rotate: 0.9,isNew:false },
    },
  },
];

function injectDummyHistory() {
  const existing = loadHistory();
  // ダミーデータのIDが全て数値1〜5の場合は古いダミーとみなして上書き
  const isDummy = existing.length > 0 && existing.every(r => typeof r.id === 'number' && r.id <= 5);
  if (existing.length === 0 || isDummy) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(DUMMY_HISTORY));
  }
}

// ── History Modal ──────────────────────────
function openHistoryModal() {
  renderHistoryModal();
}

function renderHistoryModal() {
  const existing = document.getElementById('history-modal-overlay');
  if (existing) existing.remove();

  const history = loadHistory();
  if (history.length === 0) {
    showToast('まだ過去のゲームがないよ');
    return;
  }

  const gamesHTML = history.map((record, gi) => {
    const snapList = Object.values(record.snapshots || {});
    const careLabel = CARE_TYPES[record.careType]?.label || '???';
    const date = new Date(record.savedAt);
    const dateStr = `${date.getMonth()+1}/${date.getDate()}`;
    const gameNum = history.length - gi;

    const photosHTML = snapList.length > 0
      ? snapList.map((s, idx) =>
          `<div class="hist-photo-wrap" data-game="${gi}" data-snap-idx="${idx}">${createPhotoCardHTML(s)}</div>`
        ).join('')
      : '<div class="hist-empty">写真なし</div>';

    return `
      <div class="hist-game-row">
        <div class="hist-game-header">
          <span class="hist-game-num">ゲーム${gameNum}</span>
          <span class="hist-game-detail">${careLabel} · ${record.finalAge}日目 · ${dateStr}</span>
        </div>
        <div class="hist-photos">${photosHTML}</div>
      </div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.id        = 'history-modal-overlay';
  overlay.className = 'history-modal-overlay';
  overlay.innerHTML = `
    <div class="history-modal" id="history-modal">
      <div class="hist-header">
        <span class="hist-title">📚 過去のゲームを振り返る</span>
        <button class="hist-close-btn" id="hist-close">✕</button>
      </div>
      <div class="hist-all-games">${gamesHTML}</div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeHistoryModal(); });
  document.getElementById('hist-close').addEventListener('click', closeHistoryModal);

  overlay.querySelectorAll('.hist-photo-wrap').forEach(wrap => {
    wrap.addEventListener('click', () => {
      const gi  = parseInt(wrap.dataset.game);
      const idx = parseInt(wrap.dataset.snapIdx);
      const snapList = Object.values(history[gi].snapshots || {});
      openMemoryModal(snapList, idx);
    });
  });
}

function closeHistoryModal() {
  const overlay = document.getElementById('history-modal-overlay');
  if (!overlay) return;
  overlay.classList.add('closing');
  setTimeout(() => overlay.remove(), 200);
}

// ── Memory Modal ───────────────────────────
let modalSnapList = [];
let modalIndex   = 0;

function openMemoryModal(snaps, index) {
  modalSnapList = snaps;
  modalIndex    = index;
  renderModal();
}

function renderModal() {
  const existing = document.getElementById('memory-modal-overlay');
  if (existing) existing.remove();

  const snap = modalSnapList[modalIndex];
  if (!snap) return;

  const season   = snap.season || 'spring';
  const giftEmoji = { hat:'🎩', scarf:'🧣', sunglasses:'🕶️' }[snap.equippedItem] || '';
  const giftSticker = snap.equippedItem
    ? `<div class="modal-gift-sticker">${giftEmoji}</div>` : '';

  const seasonLabel = { spring:'🌸 春', summer:'☀️ 夏', autumn:'🍂 秋', winter:'❄️ 冬' }[season] || '';

  const hasPrev = modalIndex > 0;
  const hasNext = modalIndex < modalSnapList.length - 1;

  const overlay = document.createElement('div');
  overlay.id        = 'memory-modal-overlay';
  overlay.className = 'memory-modal-overlay';
  overlay.innerHTML = `
    <div class="memory-modal" id="memory-modal">
      <div class="modal-viewport season-${season}">
        <div class="photo-bg">
          <div class="photo-sun"></div>
          <div class="photo-cloud"></div>
          <div class="photo-tree photo-tree-l"></div>
          <div class="photo-tree photo-tree-r"></div>
          <div class="photo-ground"></div>
        </div>
        <div class="modal-dog-wrap">${createMiniDogHTML(snap)}</div>
        ${giftSticker}
      </div>
      <div class="modal-info">
        <div class="modal-stage">${snap.stageIcon} ${snap.stageName}</div>
        <div class="modal-meta">${seasonLabel} &nbsp;·&nbsp; ${snap.day}日目</div>
        <div class="modal-happiness">♥ ${snap.happiness}</div>
      </div>
      <div class="modal-nav">
        <button class="modal-nav-btn" id="modal-prev" ${hasPrev ? '' : 'disabled style="opacity:.35"'}>◀ 前</button>
        <button class="modal-close-btn" id="modal-close">✕ 閉じる</button>
        <button class="modal-nav-btn" id="modal-next" ${hasNext ? '' : 'disabled style="opacity:.35"'}>次 ▶</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeMemoryModal(); });
  document.getElementById('modal-close').addEventListener('click', closeMemoryModal);
  document.getElementById('modal-prev').addEventListener('click', () => { if (modalIndex > 0) { modalIndex--; renderModal(); } });
  document.getElementById('modal-next').addEventListener('click', () => { if (modalIndex < modalSnapList.length - 1) { modalIndex++; renderModal(); } });
}

function closeMemoryModal() {
  const overlay = document.getElementById('memory-modal-overlay');
  const modal   = document.getElementById('memory-modal');
  if (!overlay) return;
  overlay.classList.add('closing');
  if (modal) modal.classList.add('closing');
  setTimeout(() => overlay.remove(), 200);
}

// ── Photo Album ────────────────────────────
function checkAndCaptureSnapshot() {
  const h = state.happiness;
  if (h < 72) return;
  const si = state.stage;
  const best = (state.bestHappiness || {})[si] || 0;
  if (h <= best + 1) return;
  state.bestHappiness = state.bestHappiness || {};
  state.bestHappiness[si] = h;
  const existing = (state.snapshots || {})[si];
  state.snapshots = state.snapshots || {};
  state.snapshots[si] = {
    stage: si,
    stageName: STAGES[si].name, stageIcon: STAGES[si].icon,
    type: state.careType || 'unknown',
    mood: getMood(),
    accIcon: CARE_TYPES[state.careType]?.accIcon || '',
    equippedItem: state.equippedItem,
    happiness: Math.round(h),
    day: state.age,
    season: getSeasonName(),
    rotate: existing?.rotate ?? ((Math.random()-.5)*10),
    isNew: true,
  };
  renderPhotoStrip();
}

function renderPhotoStrip() {
  const strip = document.getElementById('photo-strip');
  if (!strip) return;
  const snaps = state.snapshots || {};
  const snapList = STAGES.map((_,i) => snaps[i]).filter(Boolean);
  if (snapList.length === 0) {
    strip.innerHTML = '<div class="album-hint">ハッピーな瞬間が<br>自動で撮影されるよ♪</div>';
    return;
  }
  strip.innerHTML = snapList.map(s => createPhotoCardHTML(s)).join('');
  snapList.forEach((snap, idx) => {
    const el = strip.querySelector(`[data-stage="${snap.stage}"]`);
    if (!el) return;
    if (snap.isNew) {
      el.classList.add('new-snap');
      el.addEventListener('animationend', () => el.classList.remove('new-snap'), {once:true});
      snap.isNew = false;
    }
    el.addEventListener('click', () => openMemoryModal(snapList, idx));
  });
}

function createPhotoCardHTML(snap) {
  const rot = (snap.rotate||0).toFixed(1);
  const season = snap.season || 'spring';
  const giftEmoji = {hat:'🎩', scarf:'🧣', sunglasses:'🕶️'}[snap.equippedItem] || '';
  const giftSticker = snap.equippedItem
    ? `<div style="position:absolute;bottom:24px;right:4px;font-size:13px;z-index:5">${giftEmoji}</div>`
    : '';
  return `
  <div class="photo-card" data-stage="${snap.stage}" style="--rot:${rot}deg">
    <div class="photo-viewport season-${season}">
      <div class="photo-bg">
        <div class="photo-sun"></div>
        <div class="photo-cloud"></div>
        <div class="photo-tree photo-tree-l"></div>
        <div class="photo-tree photo-tree-r"></div>
        <div class="photo-ground"></div>
      </div>
      <div class="photo-dog-wrap">${createMiniDogHTML(snap)}</div>
      ${giftSticker}
    </div>
    <div class="photo-caption">
      <div class="photo-stage-name">${snap.stageIcon} ${snap.stageName}</div>
      <div class="photo-info">♥${snap.happiness} · ${snap.day}日目</div>
    </div>
  </div>`;
}

function createMiniDogHTML(snap) {
  const hasCls = snap.equippedItem ? `has-${snap.equippedItem}` : '';
  return `
  <div class="pet stage-${snap.stage} type-${snap.type} mood-${snap.mood} ${hasCls}">
    <div class="dog-ear dog-ear-l"></div><div class="dog-ear dog-ear-r"></div>
    <div class="dog-body">
      <div class="dog-eye-row"><div class="dog-eye"></div><div class="dog-eye"></div></div>
      <div class="dog-cheeks"><div class="dog-cheek"></div><div class="dog-cheek"></div></div>
      <div class="dog-snout"><div class="dog-nose"></div><div class="dog-mouth"></div></div>
    </div>
    <div class="dog-paws"><div class="dog-paw"></div><div class="dog-paw"></div></div>
    <div class="dog-tail"></div>
    <div class="dog-spot dog-spot-1"></div><div class="dog-spot dog-spot-2"></div>
    <div class="dog-hat">🎩</div><div class="dog-scarf">🧣</div><div class="dog-sunglasses">🕶️</div>
  </div>`;
}

// ── Toast ──────────────────────────────────
function showToast(msg) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// ── Render ─────────────────────────────────
function render() {
  // stat bars
  const statMap = { hunger: state.hunger, happy: state.happiness, clean: state.clean, energy: state.energy };
  for (const [k,v] of Object.entries(statMap)) {
    const fill = document.getElementById(`s-${k}`);
    const val  = document.getElementById(`v-${k}`);
    if (fill) fill.style.width = Math.round(v) + '%';
    if (val)  val.textContent  = Math.round(v);
  }

  // pet classes
  const pet = document.getElementById('pet');
  if (pet) {
    pet.className = ['pet', `stage-${state.stage}`, `type-${state.careType||'unknown'}`, `mood-${getMood()}`,
      state.equippedItem ? `has-${state.equippedItem}` : ''].filter(Boolean).join(' ');
  }

  // stage badge & day
  const s = STAGES[state.stage];
  const stEl = document.getElementById('pet-stage');
  if (stEl) stEl.textContent = `${s.icon} ${s.name}`;
  const di = document.getElementById('day-info');
  if (di) di.textContent = `${state.age + 1}日目`;

  // hearts
  const hearts = document.getElementById('hearts');
  if (hearts) {
    const full = Math.round(state.happiness / 20);
    hearts.textContent = '❤️'.repeat(full) + '🤍'.repeat(5 - full);
  }

  // points & type
  const pv = document.getElementById('points-val');
  if (pv) pv.textContent = state.points;
  const tl = document.getElementById('type-label');
  if (tl) tl.textContent = CARE_TYPES[state.careType]?.label || '???';

  // care acc
  const acc = document.getElementById('dog-acc');
  if (acc) acc.textContent = CARE_TYPES[state.careType]?.accIcon || '🐾';

  // cooldown buttons
  const now = Date.now();
  for (const action of ['feed','play','bath','sleep']) {
    const btn  = document.getElementById(`btn-${action}`);
    const cdEl = document.getElementById(`cd-${action}`);
    if (!btn) continue;
    const rem = cdEnd[action] - now;
    if (rem > 0) {
      btn.disabled = true;
      if (cdEl) cdEl.textContent = (rem/1000).toFixed(1) + 's';
    } else {
      btn.disabled = false;
      if (cdEl) cdEl.textContent = '';
    }
  }

  // shop buttons
  const shopMap = { hat:'shop-hat', scarf:'shop-scarf', sunglasses:'shop-sg' };
  const costIdMap = { hat:'sc-hat', scarf:'sc-scarf', sunglasses:'sc-sg' };
  for (const [key, item] of Object.entries(SHOP_ITEMS)) {
    const btn = document.getElementById(shopMap[key]);
    const costEl = document.getElementById(costIdMap[key]);
    if (!btn) continue;
    const owned    = !!state.inventory[key];
    const equipped = state.equippedItem === key;
    btn.disabled   = !owned && state.points < item.cost;
    btn.className  = 'shop-btn' + (equipped ? ' equipped' : (owned ? ' owned' : ''));
    if (costEl) costEl.textContent = equipped ? '装備中' : (owned ? 'タップで装備' : `${item.cost}pt`);
  }
}

// Cooldown refresh every 500ms
setInterval(() => {
  const now = Date.now();
  if (Object.values(cdEnd).some(t => t > now)) render();
}, 500);

// ── Init ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-feed') ?.addEventListener('click', () => doAction('feed'));
  document.getElementById('btn-play') ?.addEventListener('click', () => doAction('play'));
  document.getElementById('btn-bath') ?.addEventListener('click', () => doAction('bath'));
  document.getElementById('btn-sleep')?.addEventListener('click', () => doAction('sleep'));
  document.getElementById('shop-hat')  ?.addEventListener('click', () => buyItem('hat'));
  document.getElementById('shop-scarf')?.addEventListener('click', () => buyItem('scarf'));
  document.getElementById('shop-sg')   ?.addEventListener('click', () => buyItem('sunglasses'));
  document.getElementById('pause-btn')    ?.addEventListener('click', togglePause);
  document.getElementById('new-game-btn') ?.addEventListener('click', startNewGame);
  document.getElementById('history-btn')  ?.addEventListener('click', openHistoryModal);

  loadState();
  state.stage    = computeStage();
  state.careType = computeCareType();
  injectDummyHistory();
  applyGarden();
  renderPhotoStrip();
  render();

  gameIntervalId = setInterval(gameTick, TICK_MS);
});
