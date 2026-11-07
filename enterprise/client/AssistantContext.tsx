import React from 'react';
export const BusinessAssistantContext=React.createContext<{setTask:(task:any)=>void;setGateway:(gateway:any)=>void;setWorkspaceMode:(mode:string)=>void;workspaceRequest?:{page:string;sequence:number};requestWorkspace:(page:string)=>void}>({setTask:()=>{},setGateway:()=>{},setWorkspaceMode:()=>{},requestWorkspace:()=>{}});
