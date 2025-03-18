import ts, { ScriptTarget } from "typescript";

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