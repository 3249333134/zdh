import {createContext,useContext} from 'react';
export const WorkPlanContext=createContext<any>(null);
export const useWorkPlan=()=>useContext(WorkPlanContext);
