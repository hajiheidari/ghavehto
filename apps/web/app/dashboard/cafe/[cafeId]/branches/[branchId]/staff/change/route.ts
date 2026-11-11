import {changePanelStaff,panelId,staffPanelOrigin} from '../../../../../../../../lib/cafe-panel';

export async function POST(request:Request,{params}:{params:Promise<{cafeId:string;branchId:string}>}) {
  const reject=(status:number)=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
  const origin=staffPanelOrigin();
  if(!origin||request.headers.get('origin')!==origin) return reject(403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded') return reject(415);
  const {cafeId,branchId}=await params;
  if(!panelId(cafeId)||!panelId(branchId)||!request.body) return reject(400);
  const reader=request.body.getReader();
  const decoder=new TextDecoder();
  let data='',size=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.byteLength;
      if(size>512) {void reader.cancel().catch(()=>{});return reject(413);}
      data+=decoder.decode(value,{stream:true});
    }
    data+=decoder.decode();
  } catch {return reject(400);}
  finally {reader.releaseLock();}
  const form=new URLSearchParams(data);
  const userId=form.get('userId'),operation=form.get('operation');
  if(form.size!==2||!panelId(userId)||(operation!=='grant'&&operation!=='revoke')) return reject(400);
  const result=await changePanelStaff(cafeId,branchId,userId,operation==='grant');
  const outcome=result.state==='ready'?'saved':result.state;
  return new Response(null,{status:303,headers:{
    Location:`/dashboard/cafe/${cafeId}/branches/${branchId}/staff?outcome=${outcome}`,
    'Cache-Control':'no-store',
  }});
}
