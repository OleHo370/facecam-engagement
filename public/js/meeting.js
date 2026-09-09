const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const myName = params.get('name') || 'Guest';

document.getElementById('room-label').textContent = `Room: ${roomId}`;

const socket = io();
const videosEl = document.getElementById('videos');
const teacherPanel = document.getElementById('teacher-panel');
const engagementList = document.getElementById('engagement-list');

const names = {}; // peerId -> name

function addVideoTile(id, stream, label) {
  let tile = document.getElementById(`tile-${id}`);
  if (!tile) {
    tile = document.createElement('div');
    tile.className = 'video-tile';
    tile.id = `tile-${id}`;
    tile.innerHTML = `<video autoplay playsinline${id === 'local' ? ' muted' : ''}></video><span class="tile-label"></span>`;
    videosEl.appendChild(tile);
  }
  tile.querySelector('video').srcObject = stream;
  tile.querySelector('.tile-label').textContent = label;
}

function removeVideoTile(id) {
  const tile = document.getElementById(`tile-${id}`);
  if (tile) tile.remove();
}

function updateEngagementUI(studentId, score) {
  let row = document.getElementById(`eng-${studentId}`);
  if (!row) {
    row = document.createElement('div');
    row.id = `eng-${studentId}`;
    row.className = 'engagement-row';
    engagementList.appendChild(row);
  }
  const label = names[studentId] || studentId;
  const bored = score > 0.6;
  row.innerHTML = `<span>${label}</span><span class="${bored ? 'flag-bored' : 'flag-ok'}">${bored ? 'Bored' : 'Engaged'} (${score.toFixed(2)})</span>`;
}

async function main() {
  await getLocalStream();
  addVideoTile('local', localStream, `${myName} (you)`);

  socket.on('joined', ({ role, peers: existingPeers }) => {
    document.getElementById('role-label').textContent =
      role === 'teacher' ? 'You are the teacher' : 'You are a student';
    if (role === 'teacher') teacherPanel.hidden = false;

    existingPeers.forEach((p) => {
      names[p.id] = p.name;
      callPeer(p.id, socket, (peerId, stream) => addVideoTile(peerId, stream, names[peerId] || peerId));
    });

    if (role === 'student') {
      startEngagementStub((score) => socket.emit('engagement-score', { score }));
    }
  });

  socket.on('peer-joined', ({ id, name }) => {
    names[id] = name;
  });

  socket.on('signal', (payload) => {
    handleSignal(payload, socket, (peerId, stream) => addVideoTile(peerId, stream, names[peerId] || peerId));
  });

  socket.on('engagement-update', ({ studentId, score }) => updateEngagementUI(studentId, score));

  socket.on('peer-left', ({ id }) => {
    closePeer(id);
    removeVideoTile(id);
    const row = document.getElementById(`eng-${id}`);
    if (row) row.remove();
  });

  socket.emit('join-room', { roomId, name: myName });
}

main();
