import * as THREE from 'three';

// Small, repeatable microstructure. These are authored appearance textures,
// not measured scans of the actual solder mask, plating or resin.
export function microFinish(kind) {
 const size=256,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size);
 const random=(x,y)=>{let n=Math.imul(x+19,374761393)^Math.imul(y+53,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,grain=random(x,y),line=random(1,y);
  const v=kind==='metal'?Math.round(155+48*line+37*grain):Math.round(192+45*grain);
  pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255;
 }
 ctx.putImageData(pixels,0,0);const roughness=new THREE.CanvasTexture(canvas);
 roughness.name=`Authored ${kind} roughness`;roughness.wrapS=roughness.wrapT=THREE.RepeatWrapping;roughness.repeat.set(kind==='metal'?3:5,kind==='metal'?3:5);roughness.anisotropy=8;
 const normalCanvas=document.createElement('canvas');normalCanvas.width=normalCanvas.height=size;
 const normalCtx=normalCanvas.getContext('2d'),normalPixels=normalCtx.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4;
  const dx=pixels.data[(y*size+(x+1)%size)*4]-pixels.data[(y*size+(x+size-1)%size)*4];
  const dy=pixels.data[(((y+1)%size)*size+x)*4]-pixels.data[(((y+size-1)%size)*size+x)*4];
  // Very shallow stamping waves break up reflections across otherwise flat
  // shielding. Fine directional grain stays below the silhouette.
  const wave=kind==='metal'?12*Math.sin(x/size*Math.PI*4)+5*Math.sin(y/size*Math.PI*6):0;
  normalPixels.data[i]=128-dx*.6+wave;normalPixels.data[i+1]=128-dy*.6;normalPixels.data[i+2]=255;normalPixels.data[i+3]=255;
 }
 normalCtx.putImageData(normalPixels,0,0);const normal=new THREE.CanvasTexture(normalCanvas);
 normal.name=`Authored ${kind} micro normal`;normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.copy(roughness.repeat);normal.anisotropy=8;
 return {roughness,normal};
}

export function setupStudioEnvironment(scene,renderer){
 // A photographic softbox rig: broad highlight, narrow rim and dark flags.
 // Neutral reflected surroundings preserve the photographed solder-mask color.
 const room=new THREE.Scene();room.background=new THREE.Color('#22262b');
 const cards=[];
 for(const [w,h,x,y,z,power] of [
  [6,12,-6,9,-4,4],[1.6,10,7,6,-5,2.4],[10,2,0,5,9,2.1],
  [5,7,-9,1,-2,.65],[9,5,-6,-4,8,1.5],[18,18,0,-8,0,.7]
 ]){
  const material=new THREE.MeshBasicMaterial({color:new THREE.Color('#f4f5f6').multiplyScalar(power),side:THREE.DoubleSide});
  const card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);
  card.position.set(x,y,z);card.lookAt(0,0,0);room.add(card);cards.push(card);
 }
 const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(room,.025);
 scene.environment=target.texture;scene.environmentIntensity=.8;
 for(const card of cards){card.geometry.dispose();card.material.dispose();}pmrem.dispose();
 return ()=>target.dispose();
}

// Photograph-derived finish separation only: the blue mask is satin, the
// white printed ink is matte, exposed pads glossier. Not a measured scan.
export function photoFinish(texture){
 const canvas=document.createElement('canvas'),source=texture.image;
 canvas.width=1536;canvas.height=Math.round(source.height/source.width*canvas.width);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<pixels.data.length;i+=4){
  const r=pixels.data[i]/255,g=pixels.data[i+1]/255,b=pixels.data[i+2]/255;
  const mask=THREE.MathUtils.smoothstep(Math.max(g,b)-r,.035,.19);
  const luminance=.2126*r+.7152*g+.0722*b;
  const neutral=luminance>.70?.88:luminance<.20?.83:.48;
  const value=Math.round(255*THREE.MathUtils.lerp(neutral,.40+.10*luminance,mask));
  pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;
 }
 ctx.putImageData(pixels,0,0);
 const map=new THREE.CanvasTexture(canvas);map.name='Photo-derived satin mask and matte ink';map.anisotropy=12;
 return map;
}
