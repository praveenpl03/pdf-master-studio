import * as mupdf from "./mupdf.js";


self.onmessage = (event) => {

  try {

    const bytes = event.data;


    const doc =
      mupdf.Document.openDocument(
        bytes,
        "application/pdf"
      );


    const result = [];


    const pageCount =
      doc.countPages();


    for (
      let pageIndex = 0;
      pageIndex < pageCount;
      pageIndex++
    ) {


      const page =
        doc.loadPage(pageIndex);


      const json =
        JSON.parse(
          page
          .toStructuredText(
            "preserve-whitespace"
          )
          .asJSON()
        );


      const fonts = [];


      for (const block of json.blocks ?? []) {


        if(block.type !== "text")
          continue;


        for(const line of block.lines ?? []){


          fonts.push({

            page:
              pageIndex + 1,


            text:
              line.text,


            fontName:
              line.font?.name,


            family:
              line.font?.family,


            weight:
              line.font?.weight,


            style:
              line.font?.style,


            size:
              line.font?.size,


            bbox:
              line.bbox

          });


        }

      }


      result.push(...fonts);

    }


    self.postMessage({
      success:true,
      fonts:result
    });


  }
  catch(err){

    self.postMessage({
      success:false,
      error:String(err)
    });

  }

};