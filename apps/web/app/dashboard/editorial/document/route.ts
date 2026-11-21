import {createEditorialDocument,panelId} from '../../../../lib/cafe-panel';
import {readPanelForm,rejectPanelForm} from '../../../../lib/panel-form';

export async function POST(request:Request) {
  if(process.env.PRIVATE_EDITORIAL_VIEW!=='1') return rejectPanelForm(404);
  const form=await readPanelForm(request,1024);
  if(form instanceof Response) return form;
  const documentId=form.get('documentId'),slug=form.get('slug');
  if(form.size!==2||!panelId(documentId)||!slug||!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) return rejectPanelForm(400);
  const result=await createEditorialDocument(documentId,slug);
  if(result.state==='signed-out') return rejectPanelForm(401);
  return new Response(null,{status:303,headers:{
    Location:'/dashboard/editorial?created='+(result.state==='ready'?'saved':'unconfirmed'),'Cache-Control':'no-store',
  }});
}
