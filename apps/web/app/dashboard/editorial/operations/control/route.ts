import {changeAgentControl} from '../../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,4096);
  if(form instanceof Response) return form;
  const kind=form.get('kind'),paused=form.get('paused'),attempts=form.get('attemptLimit'),reason=form.get('reason')?.trim();
  if(form.size!==4||(kind!=='research'&&kind!=='content')||(paused!=='true'&&paused!=='false')||
    !attempts||!/^([1-9]|10)$/.test(attempts)||!reason||reason.length>240) return rejectPanelForm(400);
  const result=await changeAgentControl({kind,paused:paused==='true',attemptLimit:Number(attempts),reason});
  if(result.state==='signed-out') return rejectPanelForm(401);
  return new Response(null,{status:303,headers:{Location:'/dashboard/editorial/operations?result='+
    (result.state==='ready'?'saved':'unconfirmed'),'Cache-Control':'no-store'}});
}
