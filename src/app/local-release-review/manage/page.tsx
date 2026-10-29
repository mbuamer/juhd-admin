import {notFound} from 'next/navigation';
import Editor from './editor';
export default function Page(){if(process.env.NODE_ENV!=='development'||process.env.JUHD_LOCAL_UI_REVIEW!=='1')notFound();return <Editor/>;}
