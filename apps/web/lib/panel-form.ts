import {staffPanelOrigin} from './cafe-panel';

export const rejectPanelForm=(status:number)=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
export async function readPanelForm(request:Request,maxBytes:number):Promise<URLSearchParams|Response> {
  const origin=staffPanelOrigin();
  if(!origin||request.headers.get('origin')!==origin) return rejectPanelForm(403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded') return rejectPanelForm(415);
  if(!request.body) return rejectPanelForm(400);
  const reader=request.body.getReader(),decoder=new TextDecoder();
  let data='',size=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.byteLength;
      if(size>maxBytes) {void reader.cancel().catch(()=>{});return rejectPanelForm(413);}
      data+=decoder.decode(value,{stream:true});
    }
    return new URLSearchParams(data+decoder.decode());
  } catch {return rejectPanelForm(400);}
  finally {reader.releaseLock();}
}
