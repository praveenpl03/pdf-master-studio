import * as mupdf from "./mupdf.js";

self.onmessage = async (event) => {
  const bytes = event.data;

  try {
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");

    const pages = [];

    for (let i =0;i<doc.countPages();i++){

        const page=doc.loadPage(i);

        const bounds=page.getBounds();

        const stext=page.toStructuredText();

        const pageData={
            page:i+1,
            width:bounds[2]-bounds[0],
            height:bounds[3]-bounds[1],
            text:[],
            images:[],
            tables:[]
        };

        stext.walk({

            beginTextBlock(bbox){},

            beginLine(){},

            onChar(ch,origin,font,size,quad,color){

                pageData.text.push({

                    text:ch,

                    font:font.getName(),

                    size:size,

                    color:color,

                    x:origin[0],

                    y:origin[1],

                    quad:quad

                });

            },

            endLine(){},

            endTextBlock(){},

            onImageBlock(bbox,matrix,image){

                pageData.images.push({

                    bbox:{
                        x:bbox[0],
                        y:bbox[1],
                        w:bbox[2]-bbox[0],
                        h:bbox[3]-bbox[1]
                    },

                    width:image.getWidth(),

                    height:image.getHeight()

                });

            },

            onVector(bbox,flags,color){

                if(flags.isRectangle){

                    pageData.tables.push({

                        bbox:{
                            x:bbox[0],
                            y:bbox[1],
                            w:bbox[2]-bbox[0],
                            h:bbox[3]-bbox[1]
                        },

                        color

                    });

                }

            }

        });

        stext.destroy();
        page.destroy();

        pages.push(pageData);

    }

    doc.destroy();

    self.postMessage({

        success:true,

        pages

    });

  } catch(err){

      self.postMessage({

          success:false,

          error:err.toString()

      });

  }

};