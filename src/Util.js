export async function sleep(duration, value=null){
	return new Promise((res)=>{
		setTimeout(()=>res(value),duration);
	});
};
