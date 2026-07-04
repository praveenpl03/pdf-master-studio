import { Injectable } from '@angular/core';

export interface MuPdfTextItem {

 page:number;

 text:string;

 fontName:string;

 family:string;

 weight:string;

 style:string;

 size:number;

 bbox:{
   x:number;
   y:number;
   w:number;
   h:number;
 };

}
export interface MuPdfFont {

  page:number;

  text:string;

  fontName:string;

  family:string;

  weight:string;

  style:string;

  size:number;

  bbox:any;

}


@Injectable({
 providedIn:'root'
})
export class MuPdfService {


 private worker?:Worker;



 constructor(){


   this.worker =
     new Worker(
       "/mupdf/mupdf.worker.js",
       {
         type:"module"
       }
     );


 }
cleanFontName(font:string){

 return font.replace(
   /^[A-Z]{6}\+/,
   ''
 );

}



 extractFonts(
   pdfBytes:Uint8Array
 ):Promise<MuPdfFont[]> {


  return new Promise(
    (resolve,reject)=>{


      if(!this.worker){

        reject(
          "MuPDF worker missing"
        );

        return;
      }



      this.worker.onmessage =
       (event)=>{


        const response =
          event.data;


        if(response.success){

          resolve(
            response.fonts
          );

        }
        else{

          reject(
            response.error
          );

        }

      };



      this.worker.onerror =
       (error)=>{

        reject(error);

       };



  this.worker.postMessage(
  pdfBytes.slice()
);


    }
  );

 }

}