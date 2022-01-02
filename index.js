import WebSocket from 'ws';

let refreshToken;

const ws = new WebSocket('wss://test.deribit.com/ws/api/v2');

ws.onmessage = function (e) {
  // do something with the response...
  // console.log('received from server : ', e.data);
  // console.log(e.data);
  const message = JSON.parse(e.data);

  if (message.id === 9929) {
    console.log('authentication message received');
    console.log(`session expires in ${message.result.expires_in / 1000 / 60} minutes`);
    refreshToken = message.result.refresh_token;
    console.log(`refresh token is ${refreshToken}`);
  }

  // if (message.id === 1000 || message.id === 2000 || )
  // for (const leg in buyMsg) {
  //   ws.send(JSON.stringify(buyMsg[leg]));
  // } };
  // console.log()
  let i = 0;
  while (i < 3) {
    i++;
    ws.send(JSON.stringify(sellMsg[i]));
  }
};

ws.onopen = function () {
  ws.send(JSON.stringify(authMsg));
};
