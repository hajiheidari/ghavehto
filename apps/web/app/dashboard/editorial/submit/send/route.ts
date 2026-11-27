import {panelId,submitAgentDraft} from '../../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,500000);
  if(form instanceof Response) return form;
  const kind=form.get('kind'),operationId=form.get('operationId'),title=form.get('title'),body=form.get('body'),evidence=form.get('sources');
  if(form.size!==5||(kind!=='research'&&kind!=='content')||!panelId(operationId)||!title?.trim()||title.length>160||
    !body?.trim()||body.length>50000||!evidence) return rejectPanelForm(400);
  let sources:unknown;
  try {sources=JSON.parse(evidence);} catch {return rejectPanelForm(400);}
  if(!Array.isArray(sources)||sources.length<1||sources.length>50) return rejectPanelForm(400);
  const result=await submitAgentDraft({kind,operationId,title,body,sources});
  if(result.state==='signed-out') return rejectPanelForm(401);
  return new Response(null,{status:303,headers:{Location:'/dashboard/editorial/submit?'+new URLSearchParams({
    operation:operationId,result:result.state==='ready'?'saved':'unconfirmed'}),'Cache-Control':'no-store'}});
}
