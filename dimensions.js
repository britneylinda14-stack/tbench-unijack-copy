// Physical references, observed values, and reconstruction estimates remain distinct.
export const DIMENSIONS = {
 module: { length:69.6, depth:35.0, contactPitch:.5, thickness:1.2,
  status:'Length, pitch and thickness from DDR4 SO-DIMM reference; 35 mm depth inferred from Mercury photo ratio, not a TBench drawing.' },
 base: { width:164, depth:80, status:'Estimated from the bareboard photograph scaled by the 69.6 mm module long edge.' },
 peri: { width:39, depth:80, status:'Photo-derived estimate.' },
 usb: { bodyDepth:20.2, referenceBodyDepth:14, bodyHeight:6.9, shellWidth:13.1, openingWidth:12.5, openingHeight:5.12, pitch:[2.5,2,2.5],
  source:'https://www.we-online.com/components/products/datasheet/61400416021.pdf', status:'Opening and height use Wurth reference. Housing depth 20.2 mm is photo-estimated, not the 14 mm reference part. Exact fitted SKU unknown.' },
 rj45: { bodyDepth:17.8, referenceBodyDepth:15.7, bodyHeight:13.1, shellWidth:16.4, contactPitch:1.02,
  source:'https://www.we-online.com/components/products/datasheet/615008137421.pdf', status:'Width, height and contact pitch use Wurth reference. Housing depth 17.8 mm is photo-estimated, not the 15.7 mm reference part. Exact fitted SKU unknown.' },
 sources:{module:'https://www.tbenchsolutions.com/products/mercury-module/',sodimm:'https://www.kingston.com/datasheets/KVR26S19S6_4.pdf',pitch:'https://www.te.com/en/product-2309409-4.html',comparison:'https://www.raspberrypi.com/products/compute-module-3/'}
};
export const contactCenters = Array.from({length:130},(_,i)=>1.55+i*.5+(i>=72?2:0)-69.6/2);
