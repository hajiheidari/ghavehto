import {panelId,saveEditorialRevision} from '../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,1024*1024);
  if(form instanceof Response) return form;
  const documentId=form.get('documentId'),operationId=form.get('operationId'),expected=form.get('expectedRevision');
  const title=form.get('title'),body=form.get('body'),evidence=form.get('sources');
  if(form.size!==6||!panelId(documentId)||!panelId(operationId)||!expected||!/^(0|[1-9][0-9]{0,9})$/.test(expected)||
    Number(expected)>2147483646||!title?.trim()||title.length>160||!body?.trim()||body.length>50000||!evidence) return rejectPanelForm(400);
  let sources:unknown;
  try {sources=JSON.parse(evidence);} catch {return rejectPanelForm(400);}
  if(!Array.isArray(sources)||sources.length<1||sources.length>50) return rejectPanelForm(400);
  const result=await saveEditorialRevision({documentId,operationId,expectedRevision:Number(expected),title,body,sources});
  if(result.state==='signed-out') return rejectPanelForm(401);
  if(result.state==='unavailable') return new Response('ثبت نسخه تأیید نشد. برای بررسی آخرین نسخه و تلاش دوباره به فرم بازگردید.',{status:409,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}});
  return new Response(null,{status:303,headers:{Location:'/dashboard/editorial?'+new URLSearchParams({revision:result.data}),'Cache-Control':'no-store'}});
}
