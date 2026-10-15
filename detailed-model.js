import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { DIMENSIONS as D, contactCenters } from './dimensions.js';
import { microFinish, photoFinish } from './material-finish.js';

// Model units are millimetres. Reference dimensions and inferred dimensions are separated in dimensions.js.
// Source coordinates refer to the campaign photos at a 2048px-wide display scale.
const photoFiles = {base:'gallery-3.jpg', module:'gallery-4.jpg', peri:'gallery-2.jpg'};
const crops = {base:[545,24,963,471],module:[418,42,536,1065],back:[1091,42,536,1065],peri:[1412,44,570,1061]};
const periPhotoQuad=[[1407,44],[1955,43],[1984,1105],[1421,1106]];
const loader = new THREE.TextureLoader();
const originals = {};
const photoFinishes = {};
const makeMat=(name,color,metalness,roughness)=>Object.assign(new THREE.MeshPhysicalMaterial({color,metalness,roughness}),{name});
const M={
 pcb:makeMat('Teal solder mask','#006277',0,.32), blue:makeMat('Mercury solder mask','#06304e',0,.32),
 edge:makeMat('FR4 cut edge','#8b8866',0,.85), copper:makeMat('Exposed copper layer','#a47b46',1,.43),
 rugged:makeMat('Textured jack housing','#303234',0,.76), black:makeMat('Moulded polymer','#202126',0,.56), chip:makeMat('IC encapsulant','#242526',0,.82),
 silver:makeMat('Stamped shield metal','#a9afb4',1,.43), solder:makeMat('Solder / tin contacts','#b5bbbf',1,.31),
 gold:makeMat('Gold-plated contacts','#d1af63',1,.30), ivory:makeMat('Ivory connector body','#e4decc',0,.39),
 bronze:makeMat('Brown connector moulding','#55402c',0,.46), yellow:makeMat('Tantalum package','#c5a460',0,.6),
 tan:makeMat('Ceramic dielectric','#a89672',0,.48), brown:makeMat('Ferrite / moulded inductor','#767165',0,.71),
 green:makeMat('Terminal block','#69a370',.04,.52), inner:makeMat('Connector cavity','#070a0d',0,.9),
 capblue:makeMat('Electrolytic sleeve','#1582a4',.2,.34), capdark:makeMat('Electrolytic sleeve black','#222829',.2,.37),
 led:makeMat('LED lenses','#e9e9cb',.07,.31), ceramic:makeMat('Crystal can','#aaa691',.76,.35)
};
let primitives=0, passives=0;
const BOX=new THREE.BoxGeometry(1,1,1);
function mesh(parent,g,m,name=''){const n=new THREE.Mesh(g,m);n.name=name||m.name;n.castShadow=true;n.receiveShadow=true;parent.add(n);primitives++;return n;}
function box(p,x,y,z,w,h,d,m,name='',r=0){const n=mesh(p,r?new RoundedBoxGeometry(w,h,d,2,r):BOX,m,name);if(!r)n.scale.set(w,h,d);n.position.set(x,y,z);return n;}
function cylinder(p,x,y,z,r,h,m,seg=32,open=false){const n=mesh(p,new THREE.CylinderGeometry(r,r,h,seg,1,open),m);n.position.set(x,y,z);return n;}
function ring(p,x,y,z,r,t,m){const n=mesh(p,new THREE.TorusGeometry(r,t,6,32),m);n.rotation.x=-Math.PI/2;n.position.set(x,y,z);return n;}
function group(p,name,x=0,y=0,z=0){const n=new THREE.Group();n.name=name;n.position.set(x,y,z);p.add(n);if(['UniJack_baseboard','PeriBoard'].includes(p.name))n.userData.boardMounted=true;return n;}
// Continuous folded strip: x/y centerline, z width. Used for contacts and
// spring tongues so each visible bend remains joined to its anchor.
function strip(p,points,width,thickness,mat,name){
 const a=[],b=[];
 for(let i=0;i<points.length;i++){const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)],dx=after[0]-before[0],dy=after[1]-before[1],l=Math.hypot(dx,dy);a.push(new THREE.Vector2(points[i][0]-dy/l*thickness/2,points[i][1]+dx/l*thickness/2));b.push(new THREE.Vector2(points[i][0]+dy/l*thickness/2,points[i][1]-dx/l*thickness/2));}
 const shape=new THREE.Shape([...a,...b.reverse()]);const geo=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false});geo.translate(0,0,-width/2);return mesh(p,geo,mat,name);
}
function solderFoot(p,x,z,w,d){return box(p,x,.08,z,w,.16,d,M.solder,'Solder land',.035);}
function mapFrom(file,rect){const t=originals[file].clone();t.needsUpdate=true;t.repeat.set(rect[2]/2048,rect[3]/1152);t.offset.set(rect[0]/2048,1-(rect[1]+rect[3])/1152);t.anisotropy=12;return t;}
function photoMat(file,rect,name){
 const board=/solder mask|back photographic/.test(name),cap=/capacitor/.test(name);
 const mat=new THREE.MeshPhysicalMaterial({map:mapFrom(file,rect),color:board?'#d3dbdf':'#d5d5d5',metalness:cap?.7:0,roughness:board?1:cap?.36:.86,clearcoat:board?.16:0,clearcoatRoughness:.38,specularIntensity:board?.65:.7});
 if(board){const finish=photoFinishes[file].clone();finish.repeat.copy(mat.map.repeat);finish.offset.copy(mat.map.offset);finish.needsUpdate=true;mat.roughnessMap=finish;}
 return Object.assign(mat,{name});
}
function plane(p,x,y,z,w,d,m){const n=mesh(p,new THREE.PlaneGeometry(w,d),m);n.rotation.x=-Math.PI/2;n.position.set(x,y,z);return n;}
function roundedShape(w,d,r=.4){const s=new THREE.Shape(),a=-w/2,b=-d/2;s.moveTo(a+r,b);s.lineTo(a+w-r,b);s.quadraticCurveTo(a+w,b,a+w,b+r);s.lineTo(a+w,b+d-r);s.quadraticCurveTo(a+w,b+d,a+w-r,b+d);s.lineTo(a+r,b+d);s.quadraticCurveTo(a,b+d,a,b+d-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);return s;}
function board(p,w,d,file,crop,{holes=[],module=false,bottom=null,quad=null}={}){
 let s=roundedShape(w,d);
 if(module){ // Edge key and end relief notches visible in front/back photographs.
  const pts=[[-w/2,-d/2],[-.5,-d/2],[-.5,-d/2+1.8],[3.5,-d/2+1.8],[3.5,-d/2],[w/2,-d/2],[w/2,d/2],[3.5,d/2],[3.5,d/2-1.8],[-.5,d/2-1.8],[-.5,d/2],[-w/2,d/2],[-w/2,-3.5],[-w/2+3,-3.5],[-w/2+3,-4.5],[-w/2,-4.5]];
  s=new THREE.Shape(pts.map(([x,y])=>new THREE.Vector2(x,y)));
 }
 for(const [x,z,r] of holes){const h=new THREE.Path();h.absarc(x,-z,r,0,Math.PI*2,true);s.holes.push(h);}
 const g=new THREE.ExtrudeGeometry(s,{depth:1.25,bevelEnabled:false,curveSegments:12});g.rotateX(-Math.PI/2);mesh(p,g,M.edge,'FR4 substrate with drilled holes');
 // The photos show a fiberglass cut edge, not exposed copper on every edge.
 for(const [y,col] of [[.015,module?M.blue:M.pcb],[1.22,module?M.blue:M.pcb]]){
  const layerGeometry=new THREE.ExtrudeGeometry(s,{depth:.025,bevelEnabled:false,curveSegments:12});layerGeometry.rotateX(-Math.PI/2);const layer=mesh(p,layerGeometry,col,'PCB layer follows cutouts');layer.position.y=y;
 }
 const surf=new THREE.ShapeGeometry(s,16);const pos=surf.attributes.position;
 const uv=new Float32Array(pos.count*2);for(let i=0;i<pos.count;i++){uv[2*i]=(pos.getX(i)+w/2)/w;uv[2*i+1]=(pos.getY(i)+d/2)/d;}surf.setAttribute('uv',new THREE.BufferAttribute(uv,2));surf.rotateX(-Math.PI/2);
 if(quad){const attr=surf.attributes.uv;for(let i=0;i<attr.count;i++){const u=attr.getX(i),v=1-attr.getY(i),left=quad[0].map((a,j)=>a*(1-v)+quad[3][j]*v),right=quad[1].map((a,j)=>a*(1-v)+quad[2][j]*v);attr.setXY(i,(left[0]*(1-u)+right[0]*u)/2048,1-(left[1]*(1-u)+right[1]*u)/1152);}}
 const topMaterial=photoMat(file,quad?[0,0,2048,1152]:crop,'Photographic solder mask and silkscreen');topMaterial.polygonOffset=true;topMaterial.polygonOffsetFactor=-1;topMaterial.polygonOffsetUnits=-1;const top=mesh(p,surf,topMaterial);top.position.y=1.29;
 // Reverse the facing, not the physical outline: rotating the face mirrored
 // asymmetric holes and the edge key away from the solid board below it.
 const undersideGeometry=surf.clone(),indices=undersideGeometry.index;
 for(let i=0;i<indices.count;i+=3){const a=indices.getX(i);indices.setX(i,indices.getX(i+2));indices.setX(i+2,a);}
 const normals=undersideGeometry.attributes.normal,backUV=undersideGeometry.attributes.uv;
 for(let i=0;i<normals.count;i++){normals.setXYZ(i,0,-1,0);backUV.setX(i,1-backUV.getX(i));}
 const under=mesh(p,undersideGeometry,bottom?photoMat(file,bottom,'Mercury back photographic surface'):M.pcb,'Underside — inferred except Mercury');under.position.y=-.015;
 for(const [x,z,r] of holes){ring(p,x,1.31,z,r+.14,.22,M.gold);ring(p,x,-.04,z,r+.14,.19,M.gold);cylinder(p,x,.62,z,r+.04,1.25,M.solder,32,true);}
 return {width:w,depth:d};
}
function smd(p,x,z,w=1.05,d=.53,h=.48,mat=M.tan,y=1.3,rot=0){
 const n=group(p,'SMD passive',x,y,z);n.rotation.y=rot;box(n,0,h/2,0,w,h,d,mat,'Dielectric / resistive body',.05);
 for(const side of [-1,1])box(n,side*(w/2-.10),h/2+.02,0,.23,h+.045,d+.05,M.solder);
 passives++;
}
function gullwing(p,x,z,w,d,h,pins=16,all=false,y=1.3,mat=M.chip){
 const n=group(p,'Integrated circuit',x,y,z);box(n,0,h/2,0,w,h,d,mat,'Moulded IC package',.13);
 const side=(length,offset,angle)=>{const g=group(n,'Gull-wing leads');g.rotation.y=angle;for(let i=0;i<pins;i++){const a=-length/2+(i+.5)*length/pins;box(g,offset+.25,.11,a,.76,.22,.27,M.solder,'Solder fillet',.055);box(g,offset+.25,.25,a,.65,.15,.19,M.solder);box(g,offset+.11,.53,a,.17,.62,.19,M.solder);box(g,offset-.10,.81,a,.45,.15,.19,M.solder);}};
 side(d,w/2,0);side(d,w/2,Math.PI);if(all){side(w,d/2,Math.PI/2);side(w,d/2,-Math.PI/2);}return n;
}
function topPhoto(p,x,z,w,d,h,file,rect){plane(p,x,h+.015,z,w,d,photoMat(file,rect,'Photographic component marking'));}
function basePhotoBox(p,x,z,w,d,h,px){const n=group(p,'Photographed leadless package',x,1.29,z);box(n,0,.08,0,w-.3,.16,d-.3,M.solder,'Package contact bed');box(n,0,.12+h/2,0,w,h,d,M.chip,'IC package',.10);topPhoto(n,0,0,w-.06,d-.06,.12+h,'gallery-3.jpg',px);return n;}
function electrolytic(p,x,z,r,h,blue=false){
 const n=group(p,'Electrolytic capacitor',x,1.3,z);box(n,0,.35,0,r*2.05,.7,r*2.05,M.black,'Capacitor base',.2);
 cylinder(n,0,h/2+.55,0,r,h-.5,blue?M.capblue:M.silver,48);ring(n,0,h+.27,0,r-.13,.13,M.silver);cylinder(n,0,h+.20,0,r-.18,.09,blue?M.capblue:M.silver,48);
 box(n,0,h+.26,0,r*1.35,.025,.06,M.brown);box(n,0,h+.26,0,.06,.025,r*1.35,M.brown);
 for(const s of [-1,1])box(n,s*r,.16,0,.65,.15,r*1.2,M.solder);
 return n;
}
function header(p,x,z,rows=5,cols=2,angle=0,y=1.29){
 const n=group(p,'Pin header',x,y,z);n.rotation.y=angle;const pitch=1.25;
 box(n,0,.7,0,cols*pitch+.55,1.4,rows*pitch+.2,M.black,'Header moulding',.15);
 for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
  const a=(c-(cols-1)/2)*pitch,b=(r-(rows-1)/2)*pitch;
  box(n,a,2.4,b,.32,3.4,.32,M.gold,'Individual square pin');
  const tip=mesh(n,new THREE.CylinderGeometry(.06,.22,.42,4),M.gold);tip.rotation.y=Math.PI/4;tip.position.set(a,4.30,b);
  box(n,a,.1,b,.78,.14,.8,M.solder);
 }
}
function mezzanine(p,x,z,length,angle=0,ivory=true){
 const n=group(p,'Fine-pitch mezzanine connector',x,1.29,z);n.rotation.y=angle;const plastic=ivory?M.ivory:M.bronze;
 box(n,0,.50,0,length,1,3.65,plastic,'Connector floor',.18);
 for(const s of [-1,1]){box(n,0,1.5,s*1.55,length,2, .55,plastic,'Connector wall',.12);box(n,s*(length/2-.3),1.50,0,.60,2,3.6,plastic);box(n,s*(length/2+.25),.2,0,1.1,.3,3.4,M.silver);}
 box(n,0,.98,0,length-1.9,.8,.78,M.inner,'Connector channel');
 const count=Math.round((length-2)/.50);
 for(let i=0;i<count;i++){const a=-(length-2)/2+i*.5;for(const s of [-1,1]){box(n,a,1.39,s*.68,.19,.66,.23,M.gold,'Connector spring contact');box(n,a,.08,s*2.08,.21,.12,.87,M.solder,'Solder tail');}}
}
function slot(p){
 const n=group(p,'Mercury socket and retention clips',-41.1,1.29,0);
 box(n,0,1.65,0,5.0,3.3,69.0/(80/78),M.black,'Socket main rail',.25);
 box(n,2.30,1.65,0,.32,1,62.8,M.inner,'Card edge insertion channel');
 for(const physicalZ of contactCenters){const z=physicalZ/(80/78);box(n,2.58,2.7,z,.75,.10,.19,M.gold,'Socket contact');box(n,-2.9,.11,z,1.15,.16,.20,M.solder,'Socket solder tail');}
 for(const s of [-1,1]){
  box(n,9.6,1.55,s*34.4,21.5,3.1,1.35,M.black,'Retention arm',.18);
  box(n,18.9,2.22,s*34.0,2.2,1.3,2.3,M.black,'Retention hook',.15);
  box(n,8.3,3.19,s*34.2,16.7,.33,.64,M.solder,'Spring latch');
  box(n,18.3,2.0,s*35.3,2.1,2.0,1.0,M.silver,'Latch clip',.15);
 }
}
function slottedRoof(p,length,width,height,slots){
 const shape=roundedShape(length,width,.16);
 for(const [x,z,w,d] of slots){const h=new THREE.Path();h.moveTo(x-w/2,-z-d/2);h.lineTo(x+w/2,-z-d/2);h.lineTo(x+w/2,-z+d/2);h.lineTo(x-w/2,-z+d/2);h.closePath();shape.holes.push(h);}
 const g=new THREE.ExtrudeGeometry(shape,{depth:.20,bevelEnabled:true,bevelThickness:.04,bevelSize:.04,bevelSegments:2});g.rotateX(-Math.PI/2);const m=mesh(p,g,M.silver,'Stamped shell with open spring cutouts');m.position.y=height-.24;
 for(const [x,z,w,d] of slots){const tongue=strip(p,[[x+w/2+.4,height-.14],[x+w/2-.25,height-.14],[x-w/2+.8,height-.55],[x-w/2+.35,height-.40]],d-.45,.23,M.silver,'Anchored stamped spring');tongue.position.z=z;}
}
function usb(p,x,z){
 const n=group(p,'USB-A dimensional reference',x,1.3,z);
 // Inverse parent scaling keeps the connector in physical mm after baseboard calibration.
 n.scale.set(160/D.base.width,1,78/D.base.depth);
 const len=D.usb.bodyDepth,width=D.usb.shellWidth,h=D.usb.bodyHeight;
 const low=h-.3-D.usb.openingHeight;
 slottedRoof(n,len,width,h,[[-2,-3.3,5.8,2.0],[-2,3.3,5.8,2.0]]);
 box(n,0,low-.15,0,len,.3,width,M.silver,'USB lower shell');
 for(const side of [-1,1])box(n,0,(low+h)/2,side*(width/2-.15),len,h-low,.3,M.silver,'USB sidewall',.06);
 box(n,len/2-1.0,h/2-.15,0,2,h-.3,width-.6,M.black,'Recessed USB rear insulator',.10);
 box(n,.2,h-1.25,0,len-3.1,1.1,10.4,M.ivory,'USB keyed tongue',.12);
 for(const c of [-3.5,-1,1,3.5]){const contact=strip(n,[[-len/2+2,h-1.84],[len/2-2,h-1.84],[len/2+.1,1.2],[len/2+.1,-1.6]],.62,.16,M.gold,'Continuous USB contact and tail');contact.position.z=c;solderFoot(n,len/2+.1,c,1,.9);}
 for(const side of [-1,1]){
  box(n,-len/2+.25,(h+low)/2,side*(width/2-.13),.50,h-low,.36,M.silver,'Folded mouth edge',.08);
  const anchor=strip(n,[[3.8,h-1],[3.8,.2],[4.8,.08]],1.1,.28,M.silver,'Shield-to-board anchor');anchor.position.z=side*(width/2-.1);solderFoot(n,4.6,side*(width/2-.1),2.2,1.7);
  box(n,-2,(low-.3)/2,side*4.4,2.4,low-.3,.7,M.ivory,'Insulator support foot',.08);
 }
 for(const y of [h-.14,low-.14])box(n,-len/2+.02,y,0,.48,.32,width,M.silver,'Rolled mating rim',.09);
 box(n,len/2-.4,h+.03,0,.5,.06,width-.8,M.silver,'Rear fold seam',.025);
 n.userData.dimensions=D.usb;
}
function ethernet(p,x,z){
 const n=group(p,'RJ45 dimensional reference',x,1.3,z);n.scale.set(160/D.base.width,1,78/D.base.depth);
 const len=D.rj45.bodyDepth,width=D.rj45.shellWidth,h=D.rj45.bodyHeight;
 slottedRoof(n,len,width,h,[[-2,-5.5,4.8,1.8],[-2,5.5,4.8,1.8]]);
 box(n,0,.2,0,len,.4,width,M.silver,'RJ45 lower shield');
 for(const side of [-1,1]){
  box(n,0,h/2,side*(width/2-.18),len,h,.36,M.silver,'RJ45 shell side',.07);
  box(n,-len/2+.2,6.3,side*7.25,.45,12.1,1.5,M.black,'RJ45 opening side');
  box(n,-len/2-.07,11.0,side*5.65,.25,1.85,2.4,side>0?M.green:M.led,'RJ45 LED lens',.12);
  box(n,-len/2+.04,h/2,side*(width/2-.2),.42,h,.45,M.silver,'Folded front corner',.07);
  const seam=box(n,len/2-1.2,h/2,side*(width/2+.025),.15,h-.9,.08,M.silver,'Folded shell seam',.025);
  const anchor=strip(n,[[len/2-2,h/2],[len/2-2,.1],[len/2-1,.08]],1.15,.26,M.silver,'RJ45 shield anchor');anchor.position.z=side*(width/2-.3);solderFoot(n,len/2-1,side*(width/2-.3),2.4,1.75);
 }
 box(n,len/2-.65,h/2,0,1.3,h-.5,width-.5,M.black,'RJ45 rear housing');
 // Tab-up keyed opening: channel floor, shoulders and upper latch recess.
 box(n,-.25,2.0,0,len-1.5,2.5,12.7,M.black,'RJ45 cavity floor');
 for(const side of [-1,1])box(n,-1,10.7,side*4.8,13.1,3.4,3.2,M.black,'RJ45 latch shoulder');
 box(n,-.5,12.55,0,13,.5,5.3,M.black,'Upper latch bridge');
 for(let i=0;i<8;i++){
  const zz=(i-3.5)*D.rj45.contactPitch;
  const wire=strip(n,[[-len/2+1.3,3.1],[-1.8,5.3],[len/2-1,5.1],[len/2+.8,.18],[len/2+.8,-1.55]],.28,.16,M.gold,'Bent RJ45 contact and tail');wire.position.z=zz;solderFoot(n,len/2+.8,zz,.8,.65);
 }
 for(const y of [.25,h-.18])box(n,-len/2+.01,y,0,.48,.38,width,M.silver,'Folded front rim',.08);
 n.userData.dimensions=D.rj45;
}
function power(p,x,z){
 const n=group(p,'DC barrel jack',x,1.29,z),h=9.2,w=9.8,len=12.2;
 const shape=roundedShape(w,h,.55),hole=new THREE.Path();hole.absarc(0,0,2.9,0,Math.PI*2,true);shape.holes.push(hole);
 const bodyGeometry=new THREE.ExtrudeGeometry(shape,{depth:len-.3,bevelEnabled:true,bevelThickness:.15,bevelSize:.10,bevelSegments:2,curveSegments:32});bodyGeometry.rotateY(Math.PI/2);bodyGeometry.translate(-len/2+.15,h/2,0);mesh(n,bodyGeometry,M.rugged,'Moulded body with actual barrel bore');
 box(n,len/2-.6,h/2,0,1.2,h-.6,w-.7,M.rugged,'Jack rear wall',.25);
 const sleeve=cylinder(n,-1,h/2,0,2.73,8.6,M.silver,48,true);sleeve.rotation.z=Math.PI/2;
 const pin=cylinder(n,-.6,h/2,0,.62,7.2,M.silver,32);pin.rotation.z=Math.PI/2;
 const contact=strip(n,[[-5,2.1],[1.0,2.35],[3.4,.1]],1.3,.22,M.silver,'Barrel spring contact');
 for(const side of [-1,1]){const tab=strip(n,[[0,2.0],[0,.18],[0.9,.08]],2.7,.28,M.solder,'Barrel mounting tab');tab.position.z=side*5.6;solderFoot(n,.6,side*5.6,5.8,2.9);}
 solderFoot(n,7.2,0,3.2,2.6);box(n,6.2,.19,0,2.8,.28,1.7,M.solder,'Rear jack terminal');
}
function terminal(p){
 const n=group(p,'Two-pole screw terminal',-75.5,1.29,-10.0);
 box(n,0,.45,0,7.5,.9,8.3,M.green,'Terminal floor',.18);
 box(n,3.05,3.1,0,1.4,6.2,8.3,M.green,'Terminal rear wall',.18);
 for(const z of [-3.8,0,3.8])box(n,-.3,3.1,z,6.5,6.2,z===0?.55:.7,M.green,'Wire cavity divider',.15);
 const top=roundedShape(7.5,8.3,.18);for(const z of [-2.05,2.05]){const hole=new THREE.Path();hole.absarc(0,z,1.40,0,Math.PI*2,true);top.holes.push(hole);}
 const roof=new THREE.ExtrudeGeometry(top,{depth:.85,bevelEnabled:false});roof.rotateX(-Math.PI/2);const roofMesh=mesh(n,roof,M.green,'Recessed screw access');roofMesh.position.y=5.35;
 for(const z of [-2.05,2.05]){cylinder(n,0,5.48,z,1.17,.70,M.silver,32);box(n,0,5.845,z,1.9,.04,.27,M.inner,'Recessed screw slot');box(n,.4,2.3,z,3.4,2.4,2.9,M.gold,'Wire clamp',.08);box(n,-1,1.2,z,4.2,.5,2.8,M.silver,'Wire contact floor');solderFoot(n,1.7,z,1.9,1.9);}
}
function smallUSB(p,x,z,{mini=false}={}){
 const n=group(p,mini?'Mini USB photo reconstruction':'Micro USB photo reconstruction',x,1.29,z),w=mini?7.4:7.6,h=mini?3.8:2.6,len=mini?6.8:5.6;
 const outline=(width,height)=>[[-width/2,0],[width/2,0],[width/2,height*.62],[width/2-.7,height],[-width/2+.7,height],[-width/2,height*.62]].map(([a,b])=>new THREE.Vector2(a,b));
 const shell=new THREE.Shape(outline(w,h));const opening=new THREE.Path(outline(w-.60,h-.55).map(v=>v.add(new THREE.Vector2(0,.28))));shell.holes.push(opening);
 const geo=new THREE.ExtrudeGeometry(shell,{depth:len,bevelEnabled:false});geo.rotateY(Math.PI/2);geo.translate(-len/2,0,0);mesh(n,geo,mini?M.gold:M.silver,'Hollow shield with keyed mouth');
 box(n,-len/2+.5,h/2,0,1,h-.5,w-.8,M.black,'Rear insulator',.1);box(n,.3,mini?1.9:1.1,0,len-1.4,.65,w-1.7,M.black,'Keyed USB tongue',.08);
 for(let i=0;i<5;i++){const a=(i-2)*.8;box(n,.1,mini?1.54:.74,a,len-1.8,.10,.30,M.gold,'USB contact');solderFoot(n,-len/2-.5,a,1.2,.45);}
 for(const side of [-1,1]){box(n,0,.22,side*(w/2+.12),len*.65,.4,.55,M.silver,'Shield solder tab');solderFoot(n,0,side*(w/2+.12),len*.75,.8);}
}
function regulator(p,rect){
 const [px,pz,pw,pd]=rect,[x,z]=baseCoord(px+pw/2,pz+pd/2),w=pw/963*160,d=pd/471*78;
 const n=group(p,'Photographed power package',x,1.29,z);box(n,0,.14,-d/2-.9,w+.4,.28,2.4,M.solder,'Exposed thermal tab',.08);box(n,0,.92,0,w,1.65,d,M.black,'Power package moulding',.15);topPhoto(n,0,0,w-.08,d-.08,1.75,'gallery-3.jpg',rect);
 for(const a of [-w*.3,w*.3]){const lead=strip(n,[[d/2-.3,.75],[d/2+.4,.5],[d/2+1.4,.10]],.72,.20,M.solder,'Bent power lead');lead.rotation.y=-Math.PI/2;lead.position.x=a;box(n,a,.10,d/2+1.3,.95,.20,1.3,M.solder,'Power solder foot',.04);}
}
const baseCoord=(px,pz)=>[(px-crops.base[0])/crops.base[2]*160-80,(pz-crops.base[1])/crops.base[3]*78-39];
function chipFromPhoto(p,rect,{pins=0,all=false,height=1.15}={}){
 const [px,pz,pw,pd]=rect,[x,z]=baseCoord(px+pw/2,pz+pd/2),w=pw/963*160,d=pd/471*78;
 if(!pins)return basePhotoBox(p,x,z,w,d,height,rect);
 const n=gullwing(p,x,z,w,d,height,pins,all,1.29);topPhoto(n,0,0,w-.06,d-.06,height,'gallery-3.jpg',rect);return n;
}
function mountReport(part){
 part.updateWorldMatrix(true,true);const inv=part.matrixWorld.clone().invert();
 const details=part.children.filter(n=>n.userData.boardMounted).map(n=>{const b=new THREE.Box3();n.traverse(m=>{if(m.isMesh){m.geometry.computeBoundingBox();b.union(m.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld)));}});return {name:n.name,gapMm:Math.max(0,b.min.y-1.29)};});
 return {count:details.length,maxGapMm:Math.max(0,...details.map(n=>n.gapMm)),details};
}
function optimize(root){
 for(const major of root.children){major.updateMatrixWorld(true);const inv=major.matrixWorld.clone().invert(),byMaterial=new Map();
  major.traverse(n=>{if(!n.isMesh)return;const mat=n.material;if(Array.isArray(mat))return;const geo=n.geometry.clone().applyMatrix4(inv.clone().multiply(n.matrixWorld));const clean=geo.index?geo.toNonIndexed():geo;clean.deleteAttribute('uv1');if(!clean.attributes.uv)clean.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(clean.attributes.position.count*2),2));if(!byMaterial.has(mat))byMaterial.set(mat,[]);byMaterial.get(mat).push(clean);});
  major.clear();for(const [mat,geos] of byMaterial){const merged=mergeGeometries(geos,false);
   if(mat.normalMap){
    // Embed a tangent basis so normal maps survive GLB imports consistently.
    merged.setIndex(Array.from({length:merged.attributes.position.count},(_,i)=>i));merged.computeTangents();merged.setIndex(null);
    const tangent=merged.attributes.tangent,normal=merged.attributes.normal,n=new THREE.Vector3(),t=new THREE.Vector3();
    for(let i=0;i<tangent.count;i++){t.fromBufferAttribute(tangent,i);if(t.lengthSq()<.5){n.fromBufferAttribute(normal,i);t.set(Math.abs(n.y)<.9?0:1,Math.abs(n.y)<.9?1:0,0).cross(n).normalize();tangent.setXYZW(i,t.x,t.y,t.z,1);}}
   }
   const obj=new THREE.Mesh(merged,mat);obj.name=mat.name;obj.castShadow=true;obj.receiveShadow=true;major.add(obj);geos.forEach(g=>g.dispose());}
 }
}
export async function buildDetailedModel(){
 primitives=0;passives=0;
 const metalGrain=microFinish('metal'),polymerGrain=microFinish('polymer');
 for(const mat of [M.silver,M.solder,M.ceramic]){mat.roughnessMap=metalGrain.roughness;mat.normalMap=metalGrain.normal;mat.normalScale.set(.24,.08);}
 for(const mat of [M.black,M.chip,M.ivory,M.tan,M.bronze,M.green,M.rugged]){mat.roughnessMap=polymerGrain.roughness;mat.normalMap=polymerGrain.normal;mat.normalScale.set(.045,.045);}
 M.rugged.normalScale.set(.35,.35);
 for(const mat of [M.pcb,M.blue]){mat.clearcoat=.30;mat.clearcoatRoughness=.25;}
 await Promise.all(Object.values(photoFiles).map(async f=>{if(!originals[f]){const t=await loader.loadAsync(new URL(`./assets/${f}`,import.meta.url).href);t.colorSpace=THREE.SRGBColorSpace;originals[f]=t;}}));
 for(const file of Object.keys(originals))photoFinishes[file]??=photoFinish(originals[file]);
 const root=new THREE.Group();root.name='UniJack_photo_reconstruction_v2';root.userData={status:'PHOTO-BASED APPROXIMATION — NOT CAD',scale:'Model units: millimetres. Connector reference dimensions; Mercury depth and carrier outline inferred, not measured.',sources:['Crowd Supply UniJack campaign gallery 1–4'],underside:'Base and PeriBoard underside not photographed; plain inferred surfaces'};
 root.userData.materials='Visual appearance inferred from actual campaign photographs. Authored roughness; no measured material scans or confirmed plating composition.';
 const base=group(root,'UniJack_baseboard'),mercury=group(root,'Mercury_module'),peri=group(root,'PeriBoard');
 board(base,160,78,'gallery-3.jpg',crops.base,{holes:[[...baseCoord(609,353),.85],[...baseCoord(644,353),.85]]});slot(base);power(base,-73.8,-27.6);terminal(base);usb(base,-72.1,6.0);ethernet(base,-72.5,27.8);
 // Project each package and its own marking from the same image rectangle.
 // This prevents a second offset chip from showing through beside the mesh.
 chipFromPhoto(base,[968,178,88,80],{height:1.35});
 for(const px of [846,1192])for(const pz of [83,157,232])chipFromPhoto(base,[px,pz,39,63],{pins:24,height:1.15});
 chipFromPhoto(base,[1055,88,24,26],{pins:7,all:true,height:1.05});
 chipFromPhoto(base,[1105,248,28,24],{pins:4,height:1.1});
 chipFromPhoto(base,[1373,211,51,51],{pins:12,all:true,height:1.2});
 chipFromPhoto(base,[1384,308,61,56],{height:1.1});
 chipFromPhoto(base,[1467,242,30,22],{pins:4,height:1.05});
 regulator(base,[683,111,40,38]);regulator(base,[1456,399,38,33]);
 mezzanine(base,60.0,-34.0,36.8,0,false);mezzanine(base,60.0,34.0,36.8,0,false);mezzanine(base,43.5,-4.5,32.9,Math.PI/2,false);
 for(const [x,z,rows] of [[6.5,32.9,4],[17.8,32.4,5],[29.7,32.0,5]])header(base,x,z,rows,2);
 for(let i=0;i<9;i++){const n=group(base,'Status LED package',-57+i*4.9,1.29,37.6);box(n,0,.29,0,2.1,.5,.8,M.led,'LED ceramic body',.05);for(const side of [-1,1])solderFoot(n,side*1.0,0,.44,.85);}
 // Individually placed passives, selected from visible solder lands in gallery 3.
 const clusters=[[878,35,8,15,0],[912,56,7,17,0],[955,45,4,21,0],[1088,72,3,14,0],[1326,171,7,0,13],[1359,188,4,14,0],[1394,161,4,15,0],[1404,273,4,15,0],[1448,317,4,0,14],[1453,355,3,0,13],[1476,228,3,14,0],[1465,287,2,15,0],[1120,278,3,13,0],[1058,224,3,12,0],[686,93,3,14,0]];
 clusters.forEach(([px,pz,count,dx,dz],j)=>{for(let i=0;i<count;i++){const [x,z]=baseCoord(px+i*dx,pz+i*dz);smd(base,x,z,j%4?1.05:1.55,j%4?.57:.78,.5,j%3?M.tan:M.black,1.29,dx?Math.PI/2:0);}});
 for(const rect of [[1405,374,32,15],[1400,402,21,26]]){const [px,pz,pw,pd]=rect,[x,z]=baseCoord(px+pw/2,pz+pd/2);const n=group(base,'Photographed tantalum package',x,1.29,z);const w=pw/963*160,d=pd/471*78;box(n,0,.75,0,w,1.5,d,M.yellow,'Resin capacitor',.12);topPhoto(n,0,0,w-.07,d-.07,1.5,'gallery-3.jpg',rect);for(const side of [-1,1])solderFoot(n,side*w/2,0,.5,d*.8);}
 const [dx,dz]=baseCoord(624,150);smd(base,dx,dz,5,2.2,1.5,M.black,1.29);topPhoto(base,dx,dz,4.3,2.15,2.80,'gallery-3.jpg',[608,143,31,15]);
 // Crystal can and its rolled rim; the original printed marking is retained.
 {const [x,z]=baseCoord(943,233),n=group(base,'Crystal resonator',x,1.29,z);box(n,0,.22,0,4.9,.44,3.7,M.solder,'Crystal mounting rim',.12);box(n,0,.8,0,4.35,1.2,3.15,M.ceramic,'Crystal can',.25);topPhoto(n,0,0,4.15,3.0,1.41,'gallery-3.jpg',[928,223,29,21]);}
 smallUSB(base,78.5,-22.2,{mini:true});smallUSB(base,78.5,13.8);
 // Mercury: source-proportioned board, actual through-holes, notch and dual-side contact fingers.
 const mh=[[-11.0,-31.2,1.05],[13.6,-31.2,1.05],[-11,31.2,1.05],[13.6,31.2,1.05]];
 board(mercury,33.2,66,'gallery-4.jpg',crops.module,{holes:mh,module:true,bottom:crops.back});
 for(const physicalZ of contactCenters){const z=physicalZ/(D.module.length/66);for(const y of [1.30,-.045])box(mercury,-15.48,y,z,2.2,.028,.31,M.gold,'Separate edge fingers');}
 // Positions are projected from the module photograph. Component heights are estimates.
 const cv=(px,pz)=>[(px-418)/536*33.2-16.6,(pz-42)/1065*66-33];
 const fromBox=(px,pz,pw,pd,h,m=M.chip)=>{const [x,z]=cv(px+pw/2,pz+pd/2),w=pw/536*33.2,d=pd/1065*66;box(mercury,x,1.3+h/2,z,w,h,d,m,'Raised photographed component',.10);topPhoto(mercury,x,z,w,d,1.3+h,'gallery-4.jpg',[px,pz,pw,pd]);};
 fromBox(624,501,188,188,1.35); // photographed AURIX package
 fromBox(480,136,87,114,2.3); // diode
 fromBox(677,390,117,74,1.7,M.ceramic); // quartz can
 fromBox(670,261,72,65,2.0,M.brown);fromBox(872,256,66,67,1.9,M.brown);
 const cap1=cv(619,178),cap2=cv(885,429);electrolytic(mercury,...cap1,3.60,5.30);electrolytic(mercury,...cap2,2.8,4.0,true);
 for(const [pos,r,h,rect] of [[cap1,3.25,6.92,[575,118,89,92]],[cap2,2.53,5.62,[847,390,77,77]]]){const disc=mesh(mercury,new THREE.CircleGeometry(r,48),photoMat('gallery-4.jpg',rect,'Photographic capacitor marking'));disc.rotation.x=-Math.PI/2;disc.position.set(pos[0],h,pos[1]);}
 const ic1=cv(805,204);gullwing(mercury,...ic1,4.2,4.7,1.25,8);topPhoto(mercury,...ic1,4.2,4.7,2.57,'gallery-4.jpg',[771,165,69,76]);
 const ic2=cv(890,545);gullwing(mercury,...ic2,2.65,3.2,.9,5);
 // Individually raised passive clusters following the visible component distribution.
 const rows=[
  [750,133,5,21,0],[725,160,1,0,21],[894,174,2,23,0],[886,219,2,23,0],
  [713,244,2,22,0],[779,281,1,0,18],[780,313,3,24,0],[873,338,3,23,0],
  [771,351,2,20,0],[843,373,1,0,20],[566,304,3,24,0],[566,334,3,24,0],
  [516,379,3,26,0],[492,414,2,21,0],[517,447,4,24,0],[533,491,3,24,0],
  [498,528,2,23,0],[557,550,2,23,0],[538,589,2,24,0],[589,616,1,0,20],
  [580,650,2,23,0],[590,686,1,0,20],[527,715,3,23,0],[577,749,3,23,0],
  [584,783,2,25,0],[628,758,4,23,0],[628,794,4,23,0],[697,727,4,23,0],
  [697,759,4,23,0],[687,811,4,23,0],[674,855,3,25,0],[674,897,4,23,0],
  [876,690,1,0,20],[876,717,1,0,20],[876,744,1,0,20],[876,771,1,0,20],
  [876,798,1,0,20],[876,825,1,0,20],[876,852,1,0,20],[876,879,1,0,20],
  [846,625,2,22,0],[846,665,2,22,0],[610,466,2,22,0],[641,355,1,0,20],
 ];
 rows.forEach(([px,pz,n,dx,dz],j)=>{for(let i=0;i<n;i++){const [x,z]=cv(px+i*dx,pz+i*dz);smd(mercury,x,z,j%5===0?1.08:.80,j%5===0?.59:.44,j%5===0?.66:.43,j%3?M.tan:M.black,1.31,dx?Math.PI/2:0);}});
 // Module underside packages and passives are supported by the supplied back photograph.
 // Mounts start at the bottom copper surface. The helpers' 1.3 mm default
 // belongs to the TOP face and must not be reused after inverting a group.
 const underside=group(mercury,'Mercury underside components');underside.rotation.z=Math.PI;underside.position.y=-.015;
 const backPosition=(px,pz)=>[(px-1091)/536*33.2-16.6,(pz-42)/1065*66-33];
 const backChip=backPosition(1405,214);gullwing(underside,...backChip,4.5,4.6,1.05,4,false,0);topPhoto(underside,...backChip,4.5,4.6,1.05,'gallery-4.jpg',[1369,178,72,73]);
 // Keep the ambiguous exposed-pad footprint in the photograph flat rather
 // than inventing a populated package in that position.
 for(const [px,pz,count,dx,dz] of [[1403,98,2,41,0],[1403,119,2,41,0],[1420,141,1,0,0],[1485,290,4,0,19],[1489,357,14,0,21],[1224,285,2,0,20],[1240,466,5,26,0],[1206,488,3,27,0],[1135,627,2,0,23],[1174,651,2,0,23],[1225,591,1,0,0],[1252,544,2,0,19],[1342,840,3,42,0],[1396,886,4,29,0],[1544,846,4,0,20],[1324,736,3,0,24]]){
  for(let i=0;i<count;i++){const [x,z]=backPosition(px+i*dx,pz+i*dz);smd(underside,x,z,.88,.54,.48,M.tan,0);}
 }
 mercury.updateMatrixWorld(true);const inverseMercury=mercury.matrixWorld.clone().invert();
 const mounting=underside.children.filter(part=>part.isGroup).map(part=>{part.updateWorldMatrix(true,true);const bounds=new THREE.Box3();part.traverse(n=>{if(n.isMesh){n.geometry.computeBoundingBox();bounds.union(n.geometry.boundingBox.clone().applyMatrix4(inverseMercury.clone().multiply(n.matrixWorld)));}});return {name:part.name,gapMm:Math.max(0,-.015-bounds.max.y)};});
 root.userData.undersideMounting={count:mounting.length,maxGapMm:Math.max(...mounting.map(p=>p.gapMm)),surfaceY:-.015,details:mounting};
 // PeriBoard: photo-derived silk, open receptacles and 16 discrete pin banks.
 board(peri,37.6,78,'gallery-2.jpg',crops.peri,{quad:periPhotoQuad});mezzanine(peri,0,-33.6,34.6);mezzanine(peri,0,35.1,34.6);mezzanine(peri,-12.1,-6.7,35.0,Math.PI/2);
 const periCoord=(px,pz)=>{const v=(pz-44)/1061,left=1407+14*v,right=1955+29*v;return [(px-left)/(right-left)*37.6-18.8,v*78-39];};
 for(const py of [885,760,635,504,385])for(const px of [1664,1788,1906])header(peri,...periCoord(px,py),5,2);
 header(peri,...periCoord(1908,261),5,2);
 base.scale.set(D.base.width/160,1,D.base.depth/78);
 mercury.scale.set(D.module.depth/33.2,D.module.thickness/1.25,D.module.length/66);
 peri.scale.set(D.peri.width/37.6,1,D.peri.depth/78);
 mercury.position.set(-22.2,4.35,0);peri.position.set(62.6,5.15,0);
 root.userData.dimensionReferences=D;root.userData.boardMounting={base:mountReport(base),peri:mountReport(peri)};
 const before=primitives;optimize(root);let triangles=0,drawCalls=0;root.traverse(n=>{if(n.isMesh){drawCalls++;triangles+=n.geometry.attributes.position.count/3;}});
 root.userData.geometry={authoredPrimitives:before,raisedPassives:passives,triangles,materialBatches:drawCalls};
 return {root,base,mercury,peri,stats:root.userData.geometry,rest:{mercury:mercury.position.clone(),peri:peri.position.clone()}};
}
