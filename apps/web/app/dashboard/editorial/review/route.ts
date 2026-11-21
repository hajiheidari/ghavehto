import {panelId,reviewEditorialRevision} from '../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,4096);
  if(form instanceof Response) return form;
  const revisionId=form.get('revisionId'),operationId=form.get('operationId'),decision=form.get('decision');
  const lifetime=form.get('lifetimeSeconds'),reason=form.get('reason')?.trim();
  if(form.size!==5||!panelId(revisionId)||!panelId(operationId)||(decision!=='approved'&&decision!=='rejected')||
    !lifetime||!/^[1-9][0-9]{0,5}$/.test(lifetime)||Number(lifetime)>604800||!reason||reason.length>240) {
    return rejectPanelForm(400);
  }
  const result=await reviewEditorialRevision({revisionId,operationId,decision,lifetimeSeconds:Number(lifetime),reason});
  if(result.state==='signed-out') return rejectPanelForm(401);
  const query=new URLSearchParams({revision:revisionId,review:result.state==='ready'?'saved':'unconfirmed'});
  return new Response(null,{status:303,headers:{Location:'/dashboard/editorial?'+query,'Cache-Control':'no-store'}});
}
