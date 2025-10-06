# @automaton.systems/server

[![https://nodei.co/npm/@automaton.systems/server.png?compact=true](https://nodei.co/npm/@automaton.systems/server.png?compact=true)](https://www.npmjs.com/package/@automaton.systems/server)

ZERO compile step combined webserver & API.

A simple combined file and API server for rapid webapp building.

Transparently serves typescript files via transpilation. Just import the .ts file with a .js extension instead!

## Usage

`npm install "@automaton.systems/server"`

### Basic Example
```javascript
import Server from '@automaton.systems/server';

let server = new Server();
server
	.serve('/','./public')
	.api('api')
		.get('item/{id:number}', async (reply, {id})=>{
			return await reply.json({id: id});
		});
server.start(80);
```

Creates a new server with no authentication on localhost (port 80).
* This server will serve the contents of the local directory `/public/` at http://localhost:80/ by default serving index.html at root
* HTTP GET Requests to http://localhost:80/api/item/17 will get the json response `{"id": 17}`, note the value 17 has been correctly parsed to a number

## Magic

```javascript
server.serveNodeModules();
```
Serve content from the node_modules folder in the same way you would import it in node. Currently rather flakey, and certainly not a good idea, but useful for prototyping.


```javascript
server.transpileTypescript();
```
.ts Files served by typescript will auto-magically be transpiled to .js when requested. This allows running a ts website without any build step. Full source maps are generated so stacktraces use the correct line numbers.

```javascript
server.createTSClient("./path/to/ClientAPI.ts");
```
Creates (or replaces) a ClientAPI implementation for the web-frontend to call. Use of $meta in api setup can help make this auto-generated API a bit more useful.

