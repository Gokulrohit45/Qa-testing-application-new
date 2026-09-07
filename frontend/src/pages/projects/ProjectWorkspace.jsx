import React, {useEffect,useState} from 'react';
import { useParams } from 'react-router-dom';
import ProjectDetails from './ProjectDetails';
import DesktopWorkspace from './DesktopWorkspace';
import {DesktopCloudService} from '../../services/api';

export default function ProjectWorkspace(props) {
  const { id } = useParams();
  const project = props.projects.find(p => String(p.id) === id);
  const [ready,setReady]=useState(!project?.cloud_only);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    if(!project?.cloud_only){setReady(true);return;}
    setReady(false);setError('');
    DesktopCloudService.sync(id).then(()=>{if(active)setReady(true);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[id,project?.cloud_only,retry]);
  if(project?.project_type==='desktop'&&!ready)return <section className="card p-8 space-y-4"><h1 className="text-xl font-bold">Opening your cloud workspace</h1><p>{error||'Restoring your saved tests and suites to this computer…'}</p>{error&&<button className="btn-primary" onClick={()=>setRetry(n=>n+1)}>Try again</button>}</section>;
  return project?.project_type === 'desktop'
    ? <DesktopWorkspace key={id} project={project} onSelectProject={props.onSelectProject}/>
    : <ProjectDetails {...props}/>;
}
