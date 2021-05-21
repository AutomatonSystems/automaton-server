import Server from './dist/AutomatonServer.js';
import path from 'path';

Server.Cluster(3, path.resolve('./example.js'));