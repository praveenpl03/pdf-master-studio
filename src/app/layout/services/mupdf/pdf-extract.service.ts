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
export interface MuPdfTextItem {
  page: number;
  text: string;
  fontName: string;
  family: string;
  weight: string;
  style: string;
  size: number;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface MuPdfImageItem {
  page: number;
  type: 'image';
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface MuPdfExtractionResult {
  textItems: MuPdfTextItem[];
  images: MuPdfImageItem[];
}


@Injectable({
 providedIn:'root'
})
export class MuPdfService {


 private worker?:Worker;
 private ext?:Worker;



 constructor(){


   this.worker =
     new Worker(
       "/mupdf/mupdf.worker.js",
       {
         type:"module"
       }
     );
     this.ext = new Worker(
       "/mupdf/ext.js",
       {
         type:"module"
       }
     );


 }
public extractAllItems(pdfBytes: Uint8Array): Promise<MuPdfExtractionResult> {
  return new Promise((resolve, reject) => {

    if (!this.ext) {
      reject(new Error("MuPDF worker missing"));
      return;
    }

 
   
    this.ext.onmessage = (event: MessageEvent) => {

     

      const response = event.data;

      if (!response) {
        reject(new Error("Worker returned empty response"));
        return;
      }

      if (response.debug) {
     
        return;
      }

      if (response.success) {

      

        resolve({
          textItems: response.fonts ?? [],
          images: response.images ?? []
        });

      } else {

       // console.error("Worker error:", response.error);

        reject(new Error(response.error));

      }

    };

    this.ext.onerror = (err) => {

      console.error("Worker JS Error:", err);

      reject(err);

    };

    this.ext.postMessage(pdfBytes, [pdfBytes.buffer]);

  });
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