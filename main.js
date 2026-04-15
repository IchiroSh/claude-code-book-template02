// ─────────────────────────────────────────────
//  BREAKOUT  main.js
//
//  全体構造:
//    定数定義
//    └─ Canvas サイズ、パドル・ボール・ブロックのサイズ/位置
//
//    game = IIFE（即時実行関数）
//    ├─ 状態変数      score, lives, level, paddle, ball, bricks, state
//    ├─ 入力処理      キーボード / マウス イベント
//    ├─ ヘルパー      clamp / setOverlay / updateHUD
//    ├─ ファクトリ    makePaddle / makeBall / makeBricks
//    ├─ 初期化        init / newRound / launch
//    ├─ 更新          update()
//    ├─ 描画          draw()
//    └─ ループ        loop() → requestAnimationFrame
//
//    game.start() で起動
//    外部には start / restart のみ公開（IIFEでスコープを閉じる）
// ─────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

const W = canvas.width;   // 480
const H = canvas.height;  // 420

// ── Layout constants ─────────────────────────
const PADDLE_H    = 10;
const PADDLE_Y    = H - 28;
const BALL_R      = 7;

const COLS        = 10;
const ROWS        = 5;
const BRICK_W     = 42;
const BRICK_H     = 15;
const BRICK_GAP   = 3;
const BRICK_TOP   = 48;
const BRICK_LEFT  = (W - (BRICK_W + BRICK_GAP) * COLS + BRICK_GAP) / 2;

const ROW_COLORS  = ['#e94560', '#f5a623', '#f8e71c', '#7ed321', '#4a90e2'];

// ── Game state ────────────────────────────────
const game = (() => {
  let score, lives, level;
  let paddle, ball, bricks;
  let state;        // 'ready' | 'playing' | 'over' | 'clear'
  let animId;

  // ── 入力処理 ──────────────────────────────
  // keydown/keyup でキー状態を keys オブジェクトに記録し、update() 内で毎フレーム参照する。
  // マウス移動でパドルのX座標を直接追従。ボール未発射時はボールも一緒に動く。
  const keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if ((e.key === ' ' || e.key === 'Enter') && state === 'ready') launch();
  });
  document.addEventListener('keyup',   e => { keys[e.key] = false; });

  canvas.addEventListener('mousemove', e => {
    const mx = e.clientX - canvas.getBoundingClientRect().left;
    paddle.x = clamp(mx - paddle.w / 2, 0, W - paddle.w);
    if (!ball.launched) ball.x = paddle.x + paddle.w / 2;
  });

  canvas.addEventListener('click', () => { if (state === 'ready') launch(); });

  // ── ヘルパー ──────────────────────────────
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function setOverlay(msg, showBtn) {
    document.getElementById('overlay-msg').textContent = msg;
    document.getElementById('restart-btn').style.display = showBtn ? 'inline-block' : 'none';
  }

  function updateHUD() {
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = lives;
    document.getElementById('level').textContent = level;
  }

  // ── ファクトリ ────────────────────────────
  // makePaddle: レベルが上がるたびパドル幅が4px縮小（最小50px）
  function makePaddle() {
    const w = Math.max(50, 80 - (level - 1) * 4);
    return { x: W / 2 - w / 2, y: PADDLE_Y, w };
  }

  // makeBall: レベルに応じて速度増加、±30°のランダム角度で発射
  function makeBall() {
    const speed = 3.5 + (level - 1) * 0.4;
    const angle = (Math.random() * 60 - 30) * Math.PI / 180; // ±30° from straight up
    return {
      x: paddle.x + paddle.w / 2,
      y: PADDLE_Y - BALL_R - 2,
      dx: speed * Math.sin(angle),
      dy: -speed * Math.cos(angle),
      launched: false,
    };
  }

  // makeBricks: 10列×5行のブロックを配列で生成
  function makeBricks() {
    const arr = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        arr.push({
          x: BRICK_LEFT + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP  + r * (BRICK_H + BRICK_GAP),
          color: ROW_COLORS[r % ROW_COLORS.length],
          alive: true,
        });
      }
    }
    return arr;
  }

  // ── 初期化 ────────────────────────────────
  function init() {
    score = 0; lives = 3; level = 1;
    newRound(true);
    updateHUD();
    cancelAnimationFrame(animId);
    loop();
  }

  function newRound(freshBricks) {
    paddle = makePaddle();
    if (freshBricks) bricks = makeBricks();
    ball   = makeBall();
    state  = 'ready';
    setOverlay('スペース または クリックで発射', false);
  }

  function launch() {
    ball.launched = true;
    state = 'playing';
    setOverlay('', false);
  }

  // ── update() ──────────────────────────────
  // 毎フレーム呼ばれ、以下の順に処理する:
  //   1. パドル移動  — キー入力を毎フレーム確認して座標を更新
  //   2. ボール移動  — dx/dy を座標に加算
  //   3. 壁との衝突  — 左右・上壁で速度成分を反転
  //   4. パドルとの衝突 — 当たった位置（端か中心か）で反射角を計算。
  //                       ratio（-1〜1）に応じて最大±60°に変化
  //   5. ブロックとの衝突 — AABB判定で接触を検出。
  //                         X方向とY方向どちらの重なりが小さいかで反射軸を決定
  //   6. ミス判定    — ボールが画面下を抜けたらライフ減算、0でゲームオーバー
  //   7. クリア判定  — 全ブロック破壊でレベルアップ
  function update() {
    if (state !== 'playing') return;

    // 1. パドル移動
    const pSpeed = 6;
    if (keys['ArrowLeft'])  paddle.x = clamp(paddle.x - pSpeed, 0, W - paddle.w);
    if (keys['ArrowRight']) paddle.x = clamp(paddle.x + pSpeed, 0, W - paddle.w);

    // 2. ボール移動
    ball.x += ball.dx;
    ball.y += ball.dy;

    // 3. 壁との衝突
    if (ball.x - BALL_R < 0)  { ball.x = BALL_R;     ball.dx =  Math.abs(ball.dx); }
    if (ball.x + BALL_R > W)  { ball.x = W - BALL_R; ball.dx = -Math.abs(ball.dx); }
    if (ball.y - BALL_R < 0)  { ball.y = BALL_R;     ball.dy =  Math.abs(ball.dy); }

    // 4. パドルとの衝突
    if (
      ball.dy > 0 &&
      ball.y + BALL_R >= paddle.y &&
      ball.y - BALL_R <= paddle.y + PADDLE_H &&
      ball.x >= paddle.x - BALL_R &&
      ball.x <= paddle.x + paddle.w + BALL_R
    ) {
      ball.y = paddle.y - BALL_R;
      const ratio = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1 … 1
      const maxAngle = Math.PI / 3;  // 60°
      const spd = Math.hypot(ball.dx, ball.dy);
      ball.dx = spd * Math.sin(ratio * maxAngle);
      ball.dy = -spd * Math.cos(ratio * maxAngle);
    }

    // 5. ブロックとの衝突
    for (const b of bricks) {
      if (!b.alive) continue;

      const bx2 = b.x + BRICK_W, by2 = b.y + BRICK_H;
      if (ball.x + BALL_R < b.x || ball.x - BALL_R > bx2) continue;
      if (ball.y + BALL_R < b.y || ball.y - BALL_R > by2) continue;

      b.alive = false;
      score += 10 * level;
      updateHUD();

      // X・Y それぞれの重なり量を比較し、小さい方の軸で反射
      const overlapX = Math.min(ball.x + BALL_R - b.x,  bx2 - (ball.x - BALL_R));
      const overlapY = Math.min(ball.y + BALL_R - b.y,  by2 - (ball.y - BALL_R));
      if (overlapX < overlapY) ball.dx *= -1;
      else                     ball.dy *= -1;

      break; // 1フレームで壊すブロックは1つまで
    }

    // 6. ミス判定
    if (ball.y - BALL_R > H) {
      lives--;
      updateHUD();
      if (lives <= 0) {
        state = 'over';
        setOverlay('GAME OVER  —  SCORE: ' + score, true);
      } else {
        newRound(false);
      }
      return;
    }

    // 7. クリア判定
    if (bricks.every(b => !b.alive)) {
      level++;
      updateHUD();
      newRound(true);
    }
  }

  // ── draw() ────────────────────────────────
  // 毎フレーム clearRect で全消去してから再描画する。
  //   ブロック — roundRect で角丸矩形、上部に白いハイライトで立体感
  //   パドル   — 上下グラデーション
  //   ボール   — 放射状グラデーションで立体感
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ブロック
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3);
      ctx.fill();
      // ハイライト
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(b.x + 2, b.y + 2, BRICK_W - 4, 4);
    }

    // パドル
    const pg = ctx.createLinearGradient(0, paddle.y, 0, paddle.y + PADDLE_H);
    pg.addColorStop(0, '#6ab0f5');
    pg.addColorStop(1, '#0f3460');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, paddle.w, PADDLE_H, 5);
    ctx.fill();

    // ボール
    const bg = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BALL_R);
    bg.addColorStop(0, '#fff');
    bg.addColorStop(1, '#e94560');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── ゲームループ ──────────────────────────
  // update() で状態を進め、draw() で描画し、requestAnimationFrame で次フレームを予約。
  // 約60fps で繰り返す。animId を保持することでリスタート時にループを止められる。
  function loop() {
    update();
    draw();
    animId = requestAnimationFrame(loop);
  }

  // ── 公開API ───────────────────────────────
  return {
    start:   () => { init(); },
    restart: () => { cancelAnimationFrame(animId); init(); },
  };
})();

game.start();
