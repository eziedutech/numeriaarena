// Smoke test for Class Match over a real WebSocket: opens a room, seats one
// classmate (two bots fill the rest), plays to the recap, and waits for
// match_committed. Needs a server started with OPEN_ROOMS=1.
//   node server/scripts/ws-smoke.mjs [http://127.0.0.1:3321]
const base = process.argv[2] ?? 'http://127.0.0.1:3321';
const wsBase = base.replace(/^http/, 'ws');

const res = await fetch(`${base}/api/rooms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ seats: 3 }),
});
const room = await res.json();
if (!res.ok) throw new Error(`open room: ${res.status} ${JSON.stringify(room)}`);
console.log('room', room.play_code, 'watch', room.watch_code);

function connect(code) {
  const ws = new WebSocket(`${wsBase}/api/ws`);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', code })));
  return ws;
}

const watcher = connect(room.watch_code);
let watched = 0;
watcher.addEventListener('message', () => (watched += 1));

const ws = connect(room.play_code);
const send = (m) => ws.send(JSON.stringify(m));
let points = 0;
let answered = 0;
const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('no match_committed in 6 minutes')), 6 * 60000);
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    switch (m.type) {
      case 'welcome':
        console.log('seat', m.seat, m.name);
        send({ type: 'start' });
        break;
      case 'view':
        if (m.phase === 'wave' || m.phase === 'boss') send({ type: 'next' });
        break;
      case 'offer':
        setTimeout(() => {
          if (m.game === 'balloon_burst') send({ type: 'answer_balloon', offer_id: m.offer_id, index: 0 });
          else send({ type: 'answer_orb', offer_id: m.offer_id, crystals: [0] });
        }, 3000);
        break;
      case 'verdict':
        answered += 1;
        points += m.race_points;
        if (m.retry_allowed) send({ type: 'answer_balloon', offer_id: m.offer_id, index: 1 });
        else send({ type: 'next' });
        break;
      case 'recap':
        console.log('recap', JSON.stringify(m.players.map((p) => [p.name, p.bot, p.points])));
        if (m.players[0].points !== points) reject(new Error(`points ${m.players[0].points} != ${points}`));
        break;
      case 'match_committed':
        clearTimeout(timer);
        resolve(m.match_id);
        break;
      case 'error':
        if (!['wait', 'not_your_offer', 'bad_choice', 'match_started'].includes(m.code)) console.log('error', m.code);
        break;
    }
  });
});
const matchId = await done;
console.log('committed', matchId, 'answers', answered, 'points', points, 'watcher messages', watched);
ws.close();
watcher.close();
