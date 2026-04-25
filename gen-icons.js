const fs=require('fs');

function createPNG(size,filename){
  // Minimal PNG with gradient-like solid purple
  // Using a simple approach: create a canvas-like buffer
  const {createCanvas}=(() => {
    try{return require('canvas')}catch(e){return null}
  })();
  
  if(createCanvas){
    const c=createCanvas(size,size);
    const x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,size,size);
    g.addColorStop(0,'#7c3aed');
    g.addColorStop(1,'#ec4899');
    x.fillStyle=g;
    x.beginPath();
    x.roundRect(0,0,size,size,size*0.17);
    x.fill();
    x.fillStyle='white';
    x.font=`bold ${size*0.42}px sans-serif`;
    x.textAlign='center';
    x.textBaseline='middle';
    x.fillText('QA',size/2,size/2+size*0.03);
    fs.writeFileSync(filename,c.toBuffer('image/png'));
    console.log('Created '+filename);
  }
}

createPNG(192,'public/icon-192.png');
createPNG(512,'public/icon-512.png');
