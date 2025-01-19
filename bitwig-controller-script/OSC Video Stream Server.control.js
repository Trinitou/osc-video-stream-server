loadAPI(19);

host.setShouldFailOnDeprecatedUse(true);

host.defineController("Trinitou", "OSC Video Stream Server", "1.0", "3e20ff4d-ce2f-4aca-88a6-ae0dbea08438", "Trinitou");

function init() {
   var oscConnection;
   var lastPath;
   var lastPlayPos;

   const settings = host.getDocumentState();
   const videoPathSetting = settings.getStringSetting("Path", "Video", 512, "");
   videoPathSetting.addValueObserver(path => {
      lastPath = path;
      oscConnection.sendMessage("/path", path);
   });

   const transport = host.createTransport();
   transport.playPositionInSeconds().addValueObserver(pos => {
      lastPlayPos = pos;
      oscConnection.sendMessage("/play-pos", pos);
   });

   const osc = host.getOscModule();
   oscConnection = osc.connectToUdpServer("localhost", 12345, osc.createAddressSpace());
   const addressSpace = osc.createAddressSpace();
   addressSpace.registerMethod("/refresh", "*", "request to resend the current state", (_source, _message) => {
      if (lastPath)
         oscConnection.sendMessage("/path", lastPath);
      if (lastPlayPos)
         oscConnection.sendMessage("/play-pos", lastPath);
   });
   osc.createUdpServer(54321, addressSpace);
}


function flush() {
}

function exit() {

}