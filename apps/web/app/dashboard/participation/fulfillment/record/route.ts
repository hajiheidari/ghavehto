import {fulfillParticipation,panelId} from '../../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_PARTICIPATION_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,4096);
  if(form instanceof Response) return form;
  const claimId=form.get('claimId'),operationId=form.get('operationId');
  const reason=form.get('reason')?.trim();
  if(form.size!==3||!panelId(claimId)||!panelId(operationId)||!reason||reason.length>240) return rejectPanelForm(400);
  const result=await fulfillParticipation({claimId,operationId,reason});
  if(result.state==='signed-out') return rejectPanelForm(401);
  const query=new URLSearchParams({claim:claimId});
  if(result.state==='unavailable') query.set('delivery','unconfirmed');
  return new Response(null,{status:303,headers:{Location:'/dashboard/participation/fulfillment?'+query.toString(),'Cache-Control':'no-store'}});
}
