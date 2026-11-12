import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

// Called by pg_cron with a Vault secret. No client-supplied paths or room IDs.
Deno.serve(async request=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const token=request.headers.get('x-cleanup-secret');
  if(!token)return new Response('Unauthorized',{status:401});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const authorization=await admin.rpc('authorize_room_audio_cleanup',{token});
  if(authorization.error||authorization.data!==true)return new Response('Unauthorized',{status:401});
  const lease=await admin.rpc('claim_room_cleanup');
  if(lease.error)return Response.json({error:'Cleanup lease failed'},{status:500});
  if(!lease.data)return Response.json({skipped:true});
  const started=Date.now();
  try{
    const now=new Date().toISOString();
    const {data:rooms,error}=await admin.from('listening_rooms').select('id').or('status.eq.closed,expires_at.lte.'+now).limit(30);
    if(error)throw error;
    for(const room of rooms||[]){
      const {data:items,error:queueError}=await admin.from('listening_room_queue').select('object_path').eq('room_id',room.id).eq('source','file');
      if(queueError)throw queueError;
      const paths=(items||[]).map(item=>item.object_path);
      if(paths.length){const removed=await admin.storage.from('room-audio').remove(paths);if(removed.error)throw removed.error;}
      const deleted=await admin.from('listening_rooms').delete().eq('id',room.id).or('status.eq.closed,expires_at.lte.'+now);
      if(deleted.error)throw deleted.error;
    }
    // Cancelled uploads and songs removed from otherwise active rooms.
    const stale=new Date(Date.now()-60*60*1000).toISOString();
    const {data:unused,error:unusedError}=await admin.from('listening_room_queue').select('id,object_path,source')
      .or('status.eq.removed,status.eq.error,and(status.eq.uploading,created_at.lte.'+stale+')').limit(100);
    if(unusedError)throw unusedError;
    if(unused?.length){
      const paths=unused.filter(item=>item.source==='file').map(item=>item.object_path);
      if(paths.length){const removed=await admin.storage.from('room-audio').remove(paths);if(removed.error)throw removed.error;}
      const deleted=await admin.from('listening_room_queue').delete().in('id',unused.map(item=>item.id));if(deleted.error)throw deleted.error;
    }
    const orphans=await admin.rpc('orphan_room_audio');if(orphans.error)throw orphans.error;
    if(orphans.data?.length){const deleted=await admin.storage.from('room-audio').remove(orphans.data.map((item:{path:string})=>item.path));if(deleted.error)throw deleted.error;}
    const result={cleanedRooms:rooms?.length||0,cleanedSongs:unused?.length||0,cleanedOrphans:orphans.data?.length||0,durationMs:Date.now()-started};
    console.info(JSON.stringify(result));return Response.json(result);
  }catch(reason){
    console.error(JSON.stringify({event:'room-cleanup-failed',message:reason instanceof Error?reason.message:'Unknown cleanup error',durationMs:Date.now()-started}));
    return Response.json({error:'Cleanup failed; the next scheduled run will retry.'},{status:500});
  }finally{await admin.rpc('claim_room_cleanup',{release_lease:true});}
});
