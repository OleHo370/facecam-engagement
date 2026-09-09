// Simple full-mesh WebRTC: fine for a handful of participants, which is all
// a local personal-project classroom needs.

const peers = {}; // peerId -> RTCPeerConnection
let localStream;

async function getLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  return localStream;
}

function createPeerConnection(peerId, socket, onRemoteStream) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('signal', { to: peerId, data: { candidate: e.candidate } });
  };
  pc.ontrack = (e) => onRemoteStream(peerId, e.streams[0]);

  peers[peerId] = pc;
  return pc;
}

async function callPeer(peerId, socket, onRemoteStream) {
  const pc = createPeerConnection(peerId, socket, onRemoteStream);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { to: peerId, data: { sdp: pc.localDescription } });
}

async function handleSignal({ from, data }, socket, onRemoteStream) {
  let pc = peers[from];
  if (!pc) pc = createPeerConnection(from, socket, onRemoteStream);

  if (data.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    if (data.sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: { sdp: pc.localDescription } });
    }
  } else if (data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

function closePeer(peerId) {
  if (peers[peerId]) {
    peers[peerId].close();
    delete peers[peerId];
  }
}
