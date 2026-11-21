import {cafeProfile,panelId} from '../../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../../lib/panel-form';

export async function POST(request:Request,{params}:{params:Promise<{cafeId:string}>}) {
  const {cafeId}=await params;
  if(!panelId(cafeId)) return rejectPanelForm(400);
  const form=await readPanelForm(request,2048);
  if(form instanceof Response) return form;
  const name=form.get('name')?.trim();
  if(form.size!==1||!name||name.length>120) return rejectPanelForm(400);
  const result=await cafeProfile(cafeId,name);
  return new Response(null,{status:303,headers:{
    Location:`/dashboard/cafe/${cafeId}?profile=${result.state==='ready'?'saved':'unavailable'}`,
    'Cache-Control':'no-store',
  }});
}
