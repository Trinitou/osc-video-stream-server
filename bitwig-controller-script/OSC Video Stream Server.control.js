loadAPI(19);

host.setShouldFailOnDeprecatedUse(true);

host.defineController("Trinitou", "OSC Video Stream Server", "1.0", "3e20ff4d-ce2f-4aca-88a6-ae0dbea08438", "Trinitou");

function init() {
   var oscConnection;

   const settings = host.getDocumentState();
   const videoPathSetting = settings.getStringSetting("Path", "Video", 512, "");
   videoPathSetting.addValueObserver(path => {
      oscConnection.sendMessage("/path", path);
   });

   const transport = host.createTransport();
   transport.playPositionInSeconds().addValueObserver(pos => {
      oscConnection.sendMessage("/play-pos", pos);
   });

   const osc = host.getOscModule();
   const senderAddressSpace = osc.createAddressSpace();
   oscConnection = osc.connectToUdpServer("localhost", 12345, senderAddressSpace);
}


function flush() {
}

function exit() {

}