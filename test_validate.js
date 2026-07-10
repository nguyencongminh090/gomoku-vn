const config = require('./server/config.js');
const roomManager = require('./server/managers/RoomManager.js');

const settings = {
    timerMode: 'blitz',
    timerSeconds: 60,
    timerIncrementSeconds: 10
};

console.log(roomManager._validateSettings(settings));
