# OSC Video Stream Server

A server that streams a local video file to a web browser for display and which is remotely controlled via OSC.

A Bitwig Studio controller script is also provided that lets you sync a local video file to the Bitwig Studio transport. Read more about that [here](bitwig-controller-script/README.md).

## Usage

There are two options for running the server.
   - A) Start the pre-build server executable
   - B) Run javascript directly using npm (the Node package manager). This option is good if you already use npm or if you quickly want to modify the behaviour. For more details, read below.

When the server is running,
- in the command line, the address for the video player website is shown. For now, it's always `http://localhost:6789`. Open it in a web browser of your choice.
- an OSC-capable app can connect to the server on port `12345` an send the following commands:
  - `/path`: set the path to a local video file to be streamed
  - `/set-play-pos`: set the current play position in seconds

## Known issues

- only works with mpeg4 videos (probably)
- only tested on Windows so far but might be that it also works for the others

## Running and building the server

There are two options for running the server.
   - A) Start the pre-build server executable
   - B) Run javascript directly using npm (the node package manager)
      - This option is good if you already use npm or if you quickly want to modify the behaviour
      - Instructions are documented [here](server/README.md).

Make sure you have cloned this repository and this folder is your current working directory for executing the commands.

### Directly run the javascript using npm

1. Install npm on your machine
2. Execute the following commands in a command line
   ```
   npm install
   npm start
   ```

### Build the exectuable using webpack & pkg

This is a bit more advanced but if you want to have the server as a portable executable which has nodejs and all dependencies 

1. Before starting, you once need to install `pkg`
   ```
   npm install -g pkg
   ```
2. Then build the executable using
   ```
   npm install
   npm run build
   ```

### Just bundle using webpack

Maybe if devs are interested in this

```
npm run bundle
```
