const rm = require('./server/managers/RoomManager.js');

rm.userRoomMap.set('u1', 'r1');
rm.rooms.set('r1', {
  roomId: 'r1',
  host: 'u1',
  state: 'waiting',
  users: new Map([['u1', { id: 'u1' }]]),
  settings: {
    timerMode: 'per_move',
    timerSeconds: 60,
    timerIncrementSeconds: 0
  }
});

const res = rm.updateSettings('u1', { timerMode: 'blitz', timerIncrementSeconds: 10 });
console.log("Result timerMode:", res.room.settings.timerMode);
console.log("Result timerIncrement:", res.room.settings.timerIncrementSeconds);
