document.addEventListener("DOMContentLoaded",()=>{
  const $=id=>document.getElementById(id);
  $("nombre").textContent=documento.nombre;
  $("identificacion").textContent=documento.identificacion;
  $("fecha").textContent=documento.fecha;
  $("documento").src=documento.imagen;
  if(window.lucide){
    lucide.createIcons();
    const qrFallback=document.querySelector(".qr-fallback");
    const qrLucide=document.querySelector(".lucide-qr");
    if(qrFallback && qrLucide){ qrFallback.style.display="none"; qrLucide.style.display="block"; }
  }

  // JPG -> PDF without Python or external PDF libraries.
  $("download").addEventListener("click", async () => {
    const img = $("documento");
    const button = $("download");
    const original = button.innerHTML;

    try {
      button.disabled = true;
      button.textContent = "GENERANDO PDF...";

      const response = await fetch(documento.imagen);
      if (!response.ok) throw new Error("No se encontró constancia.jpg");
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      const jpeg = new Uint8Array(buffer);

      // Read JPEG dimensions from the file itself.
      const dimensions = getJpegDimensions(jpeg);
      if (!dimensions) throw new Error("La imagen no es un JPG válido.");

      const pdfBytes = makePdfFromJpeg(jpeg, dimensions.width, dimensions.height);
      const pdfBlob = new Blob([pdfBytes], {type:"application/pdf"});
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "constancia.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);

    } catch (error) {
      console.error("PDF:", error);
      alert("No se pudo generar el PDF. Asegúrate de que la página esté abierta desde un servidor (por ejemplo VS Code Live Server) y que documentos/constancia.jpg exista.");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
      if (window.lucide){
      lucide.createIcons();
      const qrFallback=document.querySelector(".qr-fallback");
      const qrLucide=document.querySelector(".lucide-qr");
      if(qrFallback && qrLucide){ qrFallback.style.display="none"; qrLucide.style.display="block"; }
    }
    }
  });

  function getJpegDimensions(bytes) {
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const marker = bytes[i+1];
      i += 2;
      if (marker === 0xD8 || marker === 0xD9) continue;
      if (i + 2 > bytes.length) break;
      const len = (bytes[i] << 8) | bytes[i+1];
      if (len < 2 || i + len > bytes.length) break;

      // SOF markers containing width/height.
      if ((marker >= 0xC0 && marker <= 0xC3) ||
          (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) ||
          (marker >= 0xCD && marker <= 0xCF)) {
        return {
          height: (bytes[i+3] << 8) | bytes[i+4],
          width: (bytes[i+5] << 8) | bytes[i+6]
        };
      }
      i += len;
    }
    return null;
  }

  function makePdfFromJpeg(jpeg, pixelW, pixelH) {
    // A4 width in points; height follows the JPG ratio.
    const pageW = 595.28;
    const pageH = pageW * pixelH / pixelW;
    const content = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;

    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let pos = 0;

    function addText(s) {
      const b = encoder.encode(s);
      chunks.push(b);
      pos += b.length;
    }
    function addBytes(b) {
      chunks.push(b);
      pos += b.length;
    }

    addText("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    offsets[1] = pos;
    addText("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    offsets[2] = pos;
    addText("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

    offsets[3] = pos;
    addText(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R ` +
      `/MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] ` +
      `/Resources << /XObject << /Im0 5 0 R >> >> ` +
      `/Contents 4 0 R >>\nendobj\n`
    );

    offsets[4] = pos;
    addText(`4 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

    offsets[5] = pos;
    addText(
      `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelW} /Height ${pixelH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    );
    addBytes(jpeg);
    addText("\nendstream\nendobj\n");

    const xref = pos;
    addText("xref\n0 6\n");
    addText("0000000000 65535 f \n");
    for (let n=1; n<=5; n++) {
      addText(String(offsets[n]).padStart(10,"0") + " 00000 n \n");
    }
    addText(
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    );

    const total = chunks.reduce((sum,b)=>sum+b.length,0);
    const out = new Uint8Array(total);
    let p=0;
    for (const b of chunks) { out.set(b,p); p+=b.length; }
    return out;
  }

  const modal=$("qrModal"), video=$("video"), canvas=$("canvas");
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  let stream=null, scanning=false;

  $("qrBtn").onclick=()=>{
    modal.hidden=false;
    $("scanText").textContent="Apunta al código QR del documento...";
  };
  function stop(){
    scanning=false;
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=null; video.srcObject=null;
  }

  function closeScanner(){
    stop();
    if(video) {
      video.pause();
      video.srcObject = null;
    }
    scanning = false;
    modal.hidden = true;
    $("scanText").textContent = "Apunta al código QR del documento...";
  }

  $("startCamera").addEventListener("click", startQrCamera);
  $("closeQr").addEventListener("click", closeScanner);
  $("stopCamera").addEventListener("click", closeScanner);

  // Also allow Escape to close the scanner.
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape" && !modal.hidden) closeScanner();
  });

  async function startQrCamera(){
    const status=$("scanText");
    const startBtn=$("startCamera");

    if(!window.isSecureContext && location.hostname!=="localhost" && location.hostname!=="127.0.0.1"){
      status.textContent="La cámara requiere HTTPS o localhost.";
      return;
    }

    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      status.textContent="Este navegador no permite acceder a la cámara.";
      return;
    }

    try{
      startBtn.disabled=true;
      startBtn.textContent="ABRIENDO CÁMARA...";
      status.textContent="Solicitando acceso a la cámara...";

      stop();
      if(video) video.srcObject=null;

      stream=await navigator.mediaDevices.getUserMedia({
        video:{
          facingMode:{ideal:"environment"},
          width:{ideal:1280},
          height:{ideal:720}
        },
        audio:false
      });

      video.srcObject=stream;

      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("video-timeout")),5000);
        if(video.readyState>=2){
          clearTimeout(timer);
          resolve();
        }else{
          video.onloadedmetadata=()=>{
            clearTimeout(timer);
            resolve();
          };
        }
      });

      await video.play();
      scanning=true;
      status.textContent="Apunta al código QR del documento...";
      scan();

    }catch(e){
      console.error("Camera error:",e);
      stop();
      if(e.name==="NotAllowedError"){
        status.textContent="Permiso de cámara denegado. Permite la cámara en Chrome y vuelve a intentarlo.";
      }else if(e.name==="NotFoundError"){
        status.textContent="No se encontró ninguna cámara disponible.";
      }else if(e.name==="NotReadableError"){
        status.textContent="La cámara está siendo utilizada por otra aplicación.";
      }else{
        status.textContent="No se pudo iniciar la cámara. Revisa los permisos del navegador.";
      }
    }finally{
      startBtn.disabled=false;
      startBtn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l1.5-2h7L17 7h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg> INICIAR CÁMARA';
    }
  }

  function scan(){
    if(!scanning)return;
    if(video.readyState>=2){
      canvas.width=video.videoWidth; canvas.height=video.videoHeight;
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const d=ctx.getImageData(0,0,canvas.width,canvas.height);
      const code=window.jsQR?.(d.data,d.width,d.height,{inversionAttempts:"dontInvert"});
      if(code){
        scanning=false;
        $("result").hidden=false;
        $("result").textContent="Código QR leído (demo): "+code.data;
        $("scanText").textContent="Código detectado.";
        return;
      }
    }
    requestAnimationFrame(scan);
  }
  modal.onclick=e=>{if(e.target===modal){stop();modal.hidden=true;$("result").hidden=true}};
});
