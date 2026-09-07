import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter, Routes, Route} from 'react-router-dom';
import ProjectDetails from '../src/pages/projects/ProjectDetails';
import DesktopWorkspace from '../src/pages/projects/DesktopWorkspace';
import '../src/index.css';

const desktop = new URLSearchParams(location.search).has('desktop');
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/projects/fixture']}><Routes><Route path="/projects/:id" element={desktop ? <DesktopWorkspace project={{id:'fixture',name:'Desktop fixture',project_type:'desktop'}} onSelectProject={() => {}}/> : <ProjectDetails projects={[{id:'fixture', user_id:'fixture-user',name:'Local test project',app_url:'https://example.com/login'}]} onSelectProject={() => {}} onDeleteProject={() => {}}/>}/></Routes></MemoryRouter>);
