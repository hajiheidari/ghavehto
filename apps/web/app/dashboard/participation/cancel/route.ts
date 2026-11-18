import {cancelParticipation,getParticipationReceipt,panelId} from '../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_PARTICIPATION_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,4096);
  if(form instanceof Response) return form;
  const reservationId=form.get('reservationId'),operationId=form.get('operationId');
  const reason=form.get('reason')?.trim();
  if(form.size!==3||!panelId(reservationId)||!panelId(operationId)||!reason||reason.length>240) return rejectPanelForm(400);

  const receipt=await getParticipationReceipt(reservationId);
  if(receipt.state==='signed-out') return rejectPanelForm(401);
  const query=new URLSearchParams({operation:reservationId});
  if(receipt.state!=='ready'||receipt.data.state==='fulfilled') {
    query.set('cancellation','unconfirmed');
  } else if(receipt.data.state==='reserved') {
    const result=await cancelParticipation({claimId:receipt.data.claimId,operationId,reason});
    if(result.state==='signed-out') return rejectPanelForm(401);
    if(result.state==='unavailable') query.set('cancellation','unconfirmed');
  }
  return new Response(null,{status:303,headers:{Location:'/dashboard/participation?'+query.toString(),'Cache-Control':'no-store'}});
}
