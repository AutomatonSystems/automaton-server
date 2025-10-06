import ts, { ScriptTarget } from "typescript";
import { LemonJelly } from "../LemonJelly";

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