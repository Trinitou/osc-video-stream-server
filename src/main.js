const { Server } = require('node-osc');
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
  #server;
  #onMessage;

  #log(message) {
    console.log(`osc server: ${message}`);
  }

  constructor(port, onMessage) {
    this.#port = port;
    this.#onMessage = onMessage;
    this.#server = new Server(this.#port, '0.0.0.0', () => {
      this.#log(`listening on port ${this.#port}`);
    });
    this.#server.on('message', message => {
      this.#onMessage(message[0], message.slice(1));
    });
  }
}

class VideoPlayerHtmlServer {
  #port;
  #wsPort;
  #onGetVideoFilePath;
  #onVideoFileStreamSetupSuccess;
  #app;

  #log(message) {
    console.log(`html server: ${message}`);
  }

  #getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Bitwig Video Player</title>
  </head>
  <body>
    <video id="video" width="640" height="360" muted controls>
      <source src="/video" type="video/mp4">
    </video>
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

  #serveVideoFileSteam(range, res, path) {
    // not sure how this works exactly (was AI genererated) but somehow it does stream mp4 video files to the player

    const stat = fs.statSync(path);
    const fileSize = stat.size;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

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
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      });
      fs.createReadStream(path).pipe(res);
    }
  }

  constructor(port, wsPort, onGetVideoFilePath, onVideoFileStreamSetupSuccess) {
    this.#port = port;
    this.#wsPort = wsPort;
    this.#onGetVideoFilePath = onGetVideoFilePath;
    this.#onVideoFileStreamSetupSuccess = onVideoFileStreamSetupSuccess;
    this.#app = express();
    // this.#app.use(express.static(path.join(__dirname, '~'))); // go up in folder hierarchy
    this.#app.get('/', (req, res) => {
      res.send(this.#getHtml());
    });
    this.#app.get('/video', (req, res) => {
      const path = this.#onGetVideoFilePath();
      if (!path)
        return;
      this.#serveVideoFileSteam(req.headers.range, res, path);
      this.#onVideoFileStreamSetupSuccess();
    });
    this.#app.listen(this.#port, () => {
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
const OscCommand = {
  SetFilePath: '/path',
  SetPlayPos: '/play-pos'
};
const oscPort = 12345;
new OscServer(oscPort, (address, args) => {
  switch (address) {
    case OscCommand.SetPlayPos:
      const playPos = args[0];
      lastPlayPos = playPos;
      wsApi.sendToClient(VideoPlayerApiCommand.SetPlayPos, playPos);
      break;
    case OscCommand.SetFilePath:
      videoFilePath = (path => {
        path = path.replace(/"/g, '').replace(/\\/g, '/'); // accept different path notations
        if (!fs.existsSync(path)) {
          console.log(`invalid file path provided : '${path}'`);
          return null;
        }
        console.log(`new file path provided : '${path}'`);
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
