const { Server, Client } = require('node-osc');
const express = require('express');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

class WsApi {
  #port;
  #wss;
  #wsClient; // limitation: only one client at the time
  #onClientConnected;

  #log(message) {
    console.log(`ws api: ${message}`);
  }

  constructor(port, onClientConnected) {
    this.#port = port;
    this.#wss = new WebSocket.Server({ port: this.#port });
    this.#wss.on('connection', ws => {
      this.#log(`client connected on port ${this.#port}`);
      this.#wsClient = ws;
      this.#onClientConnected();
    });
    this.#onClientConnected = onClientConnected;
  }

  sendToClient(command, data) {
    if (this.#wsClient)
      this.#wsClient.send(JSON.stringify({ command: command, data: data }));
  }
}

class OscServer {
  #port;
  #onMessage;

  #log(message) {
    console.log(`osc server: ${message}`);
  }

  constructor(port, onMessage) {
    this.#port = port;
    this.#onMessage = onMessage;
    const server = new Server(this.#port, '0.0.0.0', () => {
      this.#log(`listening on port ${this.#port}`);
    });
    server.on('message', message => {
      this.#onMessage(message[0], message.slice(1));
    });
  }
}

function sendMessageToOscClient(outPort, message, ...args) {
  const client = new Client('localhost', outPort);
  client.send(message, () => {
    client.close();
  });
}

class VideoPlayerHtmlServer {
  #port;
  #videoUrl;
  #wsPort;
  #onGetVideoFilePath;
  #onVideoFileStreamSetupSuccess;

  #log(message) {
    console.log(`html server: ${message}`);
  }

  #getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Bitwig Video Player</title>
    <style>
        html, body {
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        .video-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: black;
          overflow: hidden;
        }
        .video-container video {
          position: absolute;
          top: 50%;
          left: 50%;
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          transform: translate(-50%, -50%);
          object-fit: cover;
        }
    </style>
  </head>
  <body class="video-container">
    <div>
      <video id="video" src="${this.#videoUrl}" type="video/mp4" muted controls></video>
    </div>
    <script>
      const video = document.getElementById('video');
      class WsApi {
        #port = ${this.#wsPort};
        #onCommand;
        #ws;

        constructor(onCommand) {
          this.#onCommand = onCommand;
          this.#ws = new WebSocket('ws://localhost:' + this.#port);
          this.#ws.onopen = e => {
              console.log('Connected to websocket server on port ' + this.#port);
          };
          this.#ws.onmessage = e => {
              const object = JSON.parse(e.data);
              this.#onCommand(object.command, object.data);
          };
        }
      }
      const wsApi = new WsApi((command, data) => {
        switch(command) {
          case '${VideoPlayerApiCommand.SetPlayPos}':
            video.currentTime = data;
            break;
          case '${VideoPlayerApiCommand.ReloadVideo}':
            video.load();
            break;
        }
      });
    </script>
  </body>
</html>`;
  }

  #serveVideoFileSteam(range, res) {
    const path = this.#onGetVideoFilePath();
    if (!path)
      return res.status(404).send('no video file present');
    const fileSize = fs.statSync(path).size;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      this.#log(`website requested video range ${start} to ${end} of ${fileSize}`);
      if (start >= fileSize || end >= fileSize) {
        res.writeHead(416, {
          'Content-Range': `bytes */${fileSize}`
        });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(path, { start, end }).pipe(res);
    } else {
      this.#log('website requested full video file');
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(path).pipe(res);
    }
    this.#onVideoFileStreamSetupSuccess();
  }

  constructor(port, wsPort, onGetVideoFilePath, onVideoFileStreamSetupSuccess) {
    this.#port = port;
    this.#videoUrl = '/video';
    this.#wsPort = wsPort;
    this.#onGetVideoFilePath = onGetVideoFilePath;
    this.#onVideoFileStreamSetupSuccess = onVideoFileStreamSetupSuccess;
    const app = express();
    // this.#app.use(express.static(path.join(__dirname, '~'))); // go up in folder hierarchy
    app.get('/', (_req, res) => {
      res.send(this.#getHtml());
    });
    app.get(this.#videoUrl, (req, res) => {
      return this.#serveVideoFileSteam(req.headers.range, res);
    });
    app.listen(this.#port, () => {
      this.#log(`running at http://localhost:${this.#port}`);
    });
  }
}

const VideoPlayerApiCommand = {
  ReloadVideo: 'reload-video',
  SetPlayPos: 'set-play-pos'
};
const wsPort = 4000;
var videoFilePath;
var lastPlayPos;
const wsApi = new WsApi(wsPort, () => {
  if (videoFilePath)
    wsApi.sendToClient(VideoPlayerApiCommand.ReloadVideo);
});
const OscInCommand = {
  SetFilePath: '/path',
  SetPlayPos: '/play-pos'
};
const oscInPort = 12345;
new OscServer(oscInPort, (address, args) => {
  switch (address) {
    case OscInCommand.SetPlayPos:
      const playPos = args[0];
      lastPlayPos = playPos;
      wsApi.sendToClient(VideoPlayerApiCommand.SetPlayPos, playPos);
      break;
    case OscInCommand.SetFilePath:
      videoFilePath = (path => {
        path = path.replace(/"/g, '').replace(/\\/g, '/'); // accept different path notations
        if (!fs.existsSync(path)) {
          console.log(`received file path via OSC: '${path}' ... but file doesn't exist!`);
          return null;
        }
        console.log(`received file path via OSC: '${path}'`);
        return path;
      })(args[0]);
      wsApi.sendToClient(VideoPlayerApiCommand.ReloadVideo);
      break;
  }
});
new VideoPlayerHtmlServer(6789, wsPort, () => {
  return videoFilePath;
}, () => {
  if (lastPlayPos)
    wsApi.sendToClient(VideoPlayerApiCommand.SetPlayPos, lastPlayPos);
});
const OscOutCommand = {
  Refresh: '/refresh'
};
const oscOutPort = 54321;
sendMessageToOscClient(oscOutPort, OscOutCommand.Refresh); // just once request the OSC app to send video path and play pos for initialization (in case it was already open)
