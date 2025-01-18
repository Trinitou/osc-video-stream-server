const path = require('path');

module.exports = {
    entry: './src/main.js',  // Entry point of your application
    output: {
        filename: 'video-playback.js',  // Output filename
        path: path.resolve(__dirname, 'dist'),  // Output directory
    },
    target: 'node',  // Specify that this is for a Node.js application
    mode: 'production',  // Set mode to production for optimization
    plugins: [],
    module: {
        rules: [
            {
                test: /\.node$/, 
                use: 'node-loader'  // Load .node files if any dependencies require them
            },
        ],
    },
};
