const rm = require('./server/managers/RoomManager.js');

const res1 = rm.createRoom('u1', { timerMode: 'per_move', timerSeconds: 60 });
rm.joinRoom('u1', res1.room.roomId);

const newSettings = {
  timerMode: 'blitz',
  timerSeconds: 60,
  timerIncrementSeconds: null
};

const result = rm.updateSettings('u1', newSettings);
console.log(JSON.stringify(result, null, 2));
