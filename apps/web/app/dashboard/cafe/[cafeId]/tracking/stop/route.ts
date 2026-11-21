import {panelId,stopOwnerTrackingLink} from '../../../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../../../lib/panel-form';
export async function POST(request:Request,{params}:{params:Promise<{cafeId:string}>}) {
  if(process.env.PRIVATE_TRACKING_OWNER_VIEW!=='1') return rejectPanelForm(404);
  const {cafeId}=await params;
  if(!panelId(cafeId)) return rejectPanelForm(400);
  const form=await readPanelForm(request,4096);
  if(form instanceof Response) return form;
  const linkId=form.get('linkId'),reason=form.get('reason')?.trim();
  if(form.size!==2||!panelId(linkId)||!reason||reason.length>240) return rejectPanelForm(400);
  const result=await stopOwnerTrackingLink(cafeId,linkId,reason);
  if(result.state==='signed-out') return rejectPanelForm(401);
  return new Response(null,{status:303,headers:{Location:'/dashboard/cafe/'+cafeId+'/tracking?stop='+
    (result.state==='ready'?'saved':'unconfirmed'),'Cache-Control':'no-store'}});
}
