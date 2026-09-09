function randomRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

document.getElementById('create').onclick = () => {
  const name = document.getElementById('name').value.trim() || 'Teacher';
  const roomId = randomRoomId();
  location.href = `meeting.html?room=${roomId}&name=${encodeURIComponent(name)}`;
};

document.getElementById('join').onclick = () => {
  const name = document.getElementById('name').value.trim() || 'Student';
  const roomId = document.getElementById('room-code').value.trim();
  if (!roomId) {
    alert('Enter a meeting code');
    return;
  }
  location.href = `meeting.html?room=${roomId}&name=${encodeURIComponent(name)}`;
};
