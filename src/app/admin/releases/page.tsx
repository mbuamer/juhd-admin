import {notFound} from 'next/navigation';
import Editor from './editor';
export default function Page(){if(process.env.JUHD_RELEASE_CONTROLS_ENABLED!=='1')notFound();return <Editor/>;}
