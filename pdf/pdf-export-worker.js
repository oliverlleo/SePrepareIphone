import pdfMake from 'pdfmake/build/pdfmake.js';
import vfs from 'pdfmake/build/vfs_fonts.js';
import {pdfDefinition} from './pdf-export-core.js';
import {fonts,logo} from './pdf-export-assets.js';
pdfMake.addVirtualFileSystem({...vfs,...fonts});
pdfMake.addFonts({Roboto:{normal:'Roboto-Regular.ttf',bold:'Roboto-Medium.ttf',italics:'Roboto-Italic.ttf',bolditalics:'Roboto-MediumItalic.ttf'},Lora:{normal:'Lora-Regular.ttf',bold:'Lora-Bold.ttf',italics:'Lora-Regular.ttf',bolditalics:'Lora-Bold.ttf'}});
// All input and assets are local. Document links are annotations, never downloaded.
pdfMake.setUrlAccessPolicy?.(()=>false);
self.onmessage=async({data})=>{
 try{const document=pdfDefinition(data.source,data.options,{logo}),buffer=await pdfMake.createPdf(document).getBuffer(),bytes=new Uint8Array(buffer);self.postMessage({id:data.id,bytes:bytes.buffer},[bytes.buffer]);}
 catch(error){self.postMessage({id:data.id,error:error?.message||'Não foi possível gerar o PDF.'});}
};
