import ts, { ScriptTarget } from "typescript";
import { LemonJelly } from "../LemonJelly";
import path from "node:path";

export async function TranspileTypescript(servepath: string, srcpath: string, content: Buffer<ArrayBufferLike>, dynamicFiles: Record<string, Buffer>): Promise<Buffer<ArrayBufferLike>>{
	if(srcpath.endsWith(".ts") && servepath.endsWith(".js")){
		// store ts
		let inputtext = content.toString('utf8');
		let output = ts.transpileModule(inputtext, {
			fileName: servepath.replace(".js", ".ts"),
			compilerOptions: {
				target: ScriptTarget.ES2024,
				sourceMap: true
			}
		});
		let text = output.outputText;
		//
		if(text.indexOf(".css")>0){
			let regexp = /^import ['"]([-A-Za-z\./]+\.css)['"];$/;
			output.outputText = text.split("\n").map(line=>{
					let r = regexp.exec(line);
					if(r){
						let cssfile = r[1];
						console.log(cssfile);
						let truepath = "";
						if(cssfile.startsWith("."))
							truepath = path.join(servepath.substring(0,servepath.lastIndexOf('/')+1), cssfile).replaceAll("\\","/");
						else
							truepath = path.join(`/lib/`, cssfile).replaceAll("\\","/");
						return `document.head.innerHTML += '<link rel="stylesheet" href="${truepath}" type="text/css"/>';`
					}
					return line;
				}).join("\n");
		}

		// transpiled TS
		content = Buffer.from(output.outputText,'utf8');
		// source map
		dynamicFiles[srcpath.replace(".ts", ".js.map")] = Buffer.from(output.sourceMapText, 'utf8');
	}
	return content;
}

export async function TranspileTSX(servepath: string, srcpath: string, content: Buffer<ArrayBufferLike>, dynamicFiles: Record<string, Buffer>): Promise<Buffer<ArrayBufferLike>>{
	if(srcpath.endsWith(".tsx") && servepath.endsWith(".js")){
		// store ts
		let inputtext = content.toString('utf8');
		let output = ts.transpileModule(inputtext, {
			fileName: servepath.replace(".js", ".tsx"),
			compilerOptions: {
				target: ScriptTarget.ES2024,
				sourceMap: true,

				jsx: ts.JsxEmit.React,
				jsxFactory: "LemonJelly"
			}
		});
		// transpiled TS
		content = Buffer.from(output.outputText,'utf8');
		// source map
		dynamicFiles[srcpath.replace(".tsx", ".js.map")] = Buffer.from(output.sourceMapText, 'utf8');
	}
	return content;
}