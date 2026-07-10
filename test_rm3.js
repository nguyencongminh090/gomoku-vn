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

const payload = {
  settings: {
    boardSize: 17,
    winningRule: 'freestyle',
    ruleWall: false,
    rulePortal: false,
    ruleSwap2: false,
    timerMode: 'blitz',
    timerSeconds: 60,
    timerIncrementSeconds: NaN
  }
};

const res = rm.updateSettings('u1', payload.settings);
console.log(JSON.stringify(res.room.settings, null, 2));
