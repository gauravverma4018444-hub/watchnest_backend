// Utility functions for auth and localStorage management

export const clearAllRoomData = () => {
  // Clear all watch party related localStorage
  localStorage.removeItem('watchparty_last_room_id');
  localStorage.removeItem('watchparty_last_room_name');
  localStorage.removeItem('watchparty_last_room_code');
  localStorage.removeItem('lastRoomId');
  localStorage.removeItem('watchparty_last_user_id');
};

export const saveRoomData = (room) => {
  if (!room?._id) return;
  localStorage.setItem('watchparty_last_room_id', room._id);
  localStorage.setItem('watchparty_last_room_name', room.name || '');
  localStorage.setItem('watchparty_last_room_code', room.roomCode || '');
  localStorage.setItem('lastRoomId', room._id);
};

export const saveUserId = (userId) => {
  if (userId) {
    localStorage.setItem('watchparty_last_user_id', userId);
  }
};

export const getStoredUserId = () => {
  return localStorage.getItem('watchparty_last_user_id');
};

export const hasUserChanged = (currentUserId) => {
  const storedUserId = localStorage.getItem('watchparty_last_user_id');
  if (!storedUserId) return false;
  return storedUserId !== currentUserId;
};
