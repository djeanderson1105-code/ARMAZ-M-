import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

dotenv.config();

// Initialize Firebase Admin SDK for server-side operations
const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

let isFirebaseInitialized = false;
let db: Firestore | null = null;
let bucket: any = null;

try {
  if (getApps().length === 0) {
    initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket
    });
  }
  const dbId = firebaseConfig.firestoreDatabaseId || firebaseConfig.databaseId;
  db = getFirestore(undefined, dbId && dbId !== "(default)" ? dbId : undefined);
  bucket = getStorage().bucket();
  isFirebaseInitialized = true;
  console.log("[FIREBASE-ADMIN] Successfully initialized with project ID:", firebaseConfig.projectId);
} catch (err: any) {
  console.error("[FIREBASE-ADMIN] Critical initialization failed:", err.message);
}

// PDF compilation utility for completed/registered requests
async function createEvidencePdf(requestData: any, imageBuffer: Buffer | null, imageExtension: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.275, 841.89]); // A4 paper size standard
  
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Professional Dark Navy top banner header
  page.drawRectangle({
    x: 0,
    y: 760,
    width: 595.275,
    height: 81.89,
    color: rgb(0.06, 0.09, 0.16),
  });
  
  page.drawText("SSTR - PAU BRASIL GUARABIRA", {
    x: 40,
    y: 800,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  
  page.drawText("COMPROVANTE DE TROCA / REPOSIÇÃO CONCLUÍDO", {
    x: 40,
    y: 778,
    size: 10,
    font: fontHelvetica,
    color: rgb(0.7, 0.8, 1),
  });
  
  // Print formatted Metadata rows
  const drawMetaRow = (p: typeof page, label: string, value: string, y: number) => {
    p.drawText(label, { x: 40, y, size: 9, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    p.drawText(String(value || "N/A"), { x: 180, y, size: 9, font: fontHelvetica, color: rgb(0.1, 0.1, 0.1) });
  };
  
  let currentY = 720;
  drawMetaRow(page, "Código do Pedido:", requestData.id, currentY);
  currentY -= 18;
  drawMetaRow(page, "Data de Solicitação:", requestData.data || "N/A", currentY);
  currentY -= 18;
  drawMetaRow(page, "Setor / Rota:", requestData.setor, currentY);
  currentY -= 18;
  drawMetaRow(page, "Cliente / PDV:", `${requestData.nb} - ${requestData.nomeCliente || "Cliente Especial"}`, currentY);
  currentY -= 18;
  drawMetaRow(page, "Número da NF:", requestData.nf, currentY);
  currentY -= 18;
  drawMetaRow(page, "Responsável:", requestData.cadastroUser || "Controle Operacional", currentY);
  currentY -= 18;
  drawMetaRow(page, "Data de Baixa/Cadastro:", requestData.cadastroDate || "N/A", currentY);
  currentY -= 18;
  drawMetaRow(page, "Motivo Principal:", requestData.motivo || "N/A", currentY);
  currentY -= 25;
  
  // Table header for multi-SKU itemized specifications
  page.drawRectangle({
    x: 40,
    y: currentY - 5,
    width: 515.275,
    height: 18,
    color: rgb(0.92, 0.94, 0.97),
  });
  page.drawText("Item / SKU Especificação", { x: 45, y: currentY, size: 8, font: fontBold });
  page.drawText("Quantidade", { x: 300, y: currentY, size: 8, font: fontBold });
  page.drawText("Hectolitros (HL)", { x: 440, y: currentY, size: 8, font: fontBold });
  currentY -= 20;
  
  // Populate the items table
  if (requestData.items && Array.isArray(requestData.items)) {
    requestData.items.forEach((item: any) => {
      page.drawText(`${item.item} - ${item.descricao || "N/A"}`, { x: 45, y: currentY, size: 8, font: fontHelvetica });
      page.drawText(`${item.quantidade} un`, { x: 300, y: currentY, size: 8, font: fontHelvetica });
      page.drawText(`${item.hectolitros || 0} HL`, { x: 440, y: currentY, size: 8, font: fontHelvetica });
      currentY -= 14;
    });
  } else {
    page.drawText(`${requestData.item || "N/A"}`, { x: 45, y: currentY, size: 8, font: fontHelvetica });
    page.drawText(`${requestData.quantidade || 0} un`, { x: 300, y: currentY, size: 8, font: fontHelvetica });
    page.drawText(`${requestData.hectolitros || 0} HL`, { x: 440, y: currentY, size: 8, font: fontHelvetica });
    currentY -= 14;
  }
  
  // Render supplementary comments/observations if present
  if (requestData.observacao) {
    currentY -= 10;
    page.drawText("Observações de Controle:", { x: 40, y: currentY, size: 8, font: fontBold });
    page.drawText(requestData.observacao.substring(0, 150), { x: 160, y: currentY, size: 8, font: fontHelvetica });
    currentY -= 20;
  }
  
  // Embed photographic evidence image in the bottom sector of the document
  if (imageBuffer) {
    try {
      let pdfImg;
      if (imageExtension.toLowerCase() === "png") {
        pdfImg = await pdfDoc.embedPng(imageBuffer);
      } else {
        pdfImg = await pdfDoc.embedJpg(imageBuffer);
      }
      
      const maxWidth = 515.275;
      const maxHeight = 280;
      const scaled = pdfImg.scaleToFit(maxWidth, maxHeight);
      
      const imgY = Math.max(40, currentY - scaled.height - 30);
      
      page.drawText("EVIDÊNCIA FOTOGRÁFICA REGISTRADA NO ATO:", {
        x: 40,
        y: imgY + scaled.height + 8,
        size: 8,
        font: fontBold,
        color: rgb(0.4, 0.4, 0.4),
      });
      
      page.drawImage(pdfImg, {
        x: 40,
        y: imgY,
        width: scaled.width,
        height: scaled.height,
      });
    } catch (imgErr) {
      console.error("[PDF-COMPILATION] Failed to embed image into document:", imgErr);
    }
  }
  
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// Background handler tracking set to prevent concurrent PDF compiling races
const processingRequests = new Set<string>();

// Background handler triggered by database transitions / polling
async function processConcludedRequest(requestId: string, docData: any) {
  if (!db) return;
  if (processingRequests.has(requestId)) {
    return;
  }
  processingRequests.add(requestId);
  
  try {
    console.log(`[PDF-PIPELINE] Detected concluded request ${requestId}. Compiling permanent PDF...`);
    
    let imageBuffer: Buffer | null = null;
    let ext = "jpg";
    let originalFilename = "";
  
  if (docData.fotoUrl && typeof docData.fotoUrl === "string") {
    if (docData.fotoUrl.startsWith("/api/uploads/")) {
      originalFilename = docData.fotoUrl.split("/").pop() || "";
      const filePath = path.join(process.cwd(), "uploads", originalFilename);
      if (fs.existsSync(filePath)) {
        try {
          imageBuffer = fs.readFileSync(filePath);
          ext = originalFilename.split(".").pop() || "jpg";
        } catch (err) {
          console.error(`[PDF-PIPELINE] Error reading cached local file:`, err);
        }
      }
      
      // Fallback: If missing locally, try downloading directly from Cloud Storage bucket
      if (!imageBuffer && bucket) {
        try {
          const fileRef = bucket.file(`evidencias/pendentes/${requestId}/${originalFilename}`);
          const [exists] = await fileRef.exists();
          if (exists) {
            const [buffer] = await fileRef.download();
            imageBuffer = buffer;
            ext = originalFilename.split(".").pop() || "jpg";
          }
        } catch (err: any) {
          console.warn(`[PDF-PIPELINE] Cloud Storage download fallback error:`, err.message);
        }
      }
    } else if (docData.fotoUrl.startsWith("data:image/")) {
      try {
        const matches = docData.fotoUrl.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          ext = matches[1];
          imageBuffer = Buffer.from(matches[2], "base64");
        } else {
          imageBuffer = Buffer.from(docData.fotoUrl, "base64");
        }
      } catch (err) {
        console.error(`[PDF-PIPELINE] Base64 decoding failed:`, err);
      }
    }
  }
  
  const pdfBuffer = await createEvidencePdf(docData, imageBuffer, ext);
  const pdfFilename = `pdf_finalizada_${requestId}.pdf`;
    const pdfFilePath = path.join(process.cwd(), "uploads", pdfFilename);
    
    // Save to disk cache
    fs.writeFileSync(pdfFilePath, pdfBuffer);
    
    // Save permanently to Cloud Storage
    if (bucket) {
      try {
        const destination = `evidencias/finalizadas/${requestId}.pdf`;
        await bucket.upload(pdfFilePath, {
          destination,
          metadata: {
            contentType: "application/pdf"
          }
        });
        console.log(`[PDF-PIPELINE] Permanent PDF uploaded to Cloud Storage: ${destination}`);
      } catch (err: any) {
        console.warn(`[PDF-PIPELINE] Cloud Storage PDF upload warning:`, err.message);
      }
    }
    
    const finalPdfUrl = `/api/uploads/${pdfFilename}`;
    
    // Update the record's document in Firestore
    await db.collection("pendingRequests").doc(requestId).update({
      fotoUrl: finalPdfUrl,
      pdfGeneratedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[PDF-PIPELINE] Updated request ${requestId} with PDF URL.`);
    
    // Purge the original heavy image from local disk cache
    if (originalFilename) {
      const originalPath = path.join(process.cwd(), "uploads", originalFilename);
      if (fs.existsSync(originalPath)) {
        try {
          fs.unlinkSync(originalPath);
          console.log(`[PDF-PIPELINE] Deleted original image cache: ${originalFilename}`);
        } catch (err) {
          console.error(`[PDF-PIPELINE] Disk cleanup error:`, err);
        }
      }
      
      // Purge the original image from Cloud Storage to maintain database hygiene
      if (bucket) {
        try {
          const fileRef = bucket.file(`evidencias/pendentes/${requestId}/${originalFilename}`);
          const [exists] = await fileRef.exists();
          if (exists) {
            await fileRef.delete();
            console.log(`[PDF-PIPELINE] Purged original image from Cloud Storage bucket: ${originalFilename}`);
          }
        } catch (err: any) {
          console.warn(`[PDF-PIPELINE] Cloud Storage original cleanup warning:`, err.message);
        }
      }
    }
    
  } catch (err: any) {
    console.error(`[PDF-PIPELINE-CRITICAL] Compilation failed for request ${requestId}:`, err.message);
  } finally {
    processingRequests.delete(requestId);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable CORS for external access from GitHub Pages and client APKs
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: "25mb" }));

  // Create local folder for temporary caching and proxying of uploads
  const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  // Endpoint to compile PDF on-demand, bypassing server-side firestore queries entirely
  app.post("/api/compile-pdf", async (req, res) => {
    try {
      const { requestId, docData } = req.body;
      if (!requestId || !docData) {
        return res.status(400).json({ error: "Parâmetros 'requestId' e 'docData' são obrigatórios." });
      }

      console.log(`[API-COMPILE-PDF] Request received to compile PDF for ${requestId}.`);

      let imageBuffer: Buffer | null = null;
      let ext = "jpg";
      let originalFilename = "";

      if (docData.fotoUrl && typeof docData.fotoUrl === "string") {
        if (docData.fotoUrl.startsWith("/api/uploads/")) {
          originalFilename = docData.fotoUrl.split("/").pop() || "";
          const filePath = path.join(UPLOADS_DIR, originalFilename);
          if (fs.existsSync(filePath)) {
            try {
              imageBuffer = fs.readFileSync(filePath);
              ext = originalFilename.split(".").pop() || "jpg";
            } catch (err) {
              console.error(`[API-COMPILE-PDF] Error reading cached local file:`, err);
            }
          }
        } else if (docData.fotoUrl.startsWith("data:image/")) {
          try {
            const matches = docData.fotoUrl.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              ext = matches[1];
              imageBuffer = Buffer.from(matches[2], "base64");
            } else {
              imageBuffer = Buffer.from(docData.fotoUrl, "base64");
            }
          } catch (err) {
            console.error(`[API-COMPILE-PDF] Base64 decoding failed:`, err);
          }
        }
      }

      const pdfBuffer = await createEvidencePdf(docData, imageBuffer, ext);
      const pdfFilename = `pdf_finalizada_${requestId}.pdf`;
      const pdfFilePath = path.join(UPLOADS_DIR, pdfFilename);

      // Save to disk cache
      fs.writeFileSync(pdfFilePath, pdfBuffer);

      // Try uploading to cloud storage if bucket is ready
      if (bucket) {
        try {
          const destination = `evidencias/finalizadas/${requestId}.pdf`;
          await bucket.upload(pdfFilePath, {
            destination,
            metadata: {
              contentType: "application/pdf"
            }
          });
          console.log(`[API-COMPILE-PDF] Permanent PDF uploaded to Cloud Storage: ${destination}`);
          
          // Purge the original image from Cloud Storage to maintain database hygiene and save space
          if (originalFilename) {
            try {
              const fileRef = bucket.file(`evidencias/pendentes/${requestId}/${originalFilename}`);
              const [exists] = await fileRef.exists();
              if (exists) {
                await fileRef.delete();
                console.log(`[API-COMPILE-PDF] Purged original image from Cloud Storage bucket: ${originalFilename}`);
              }
            } catch (storageDelErr: any) {
              console.warn(`[API-COMPILE-PDF] Cloud Storage original cleanup warning:`, storageDelErr.message);
            }
          }
        } catch (err: any) {
          console.warn(`[API-COMPILE-PDF] Cloud Storage PDF upload/cleanup warning:`, err.message);
        }
      }

      const finalPdfUrl = `/api/uploads/${pdfFilename}`;

      // Try to clean up local cache of original heavy image if requested
      if (originalFilename) {
        const originalPath = path.join(UPLOADS_DIR, originalFilename);
        if (fs.existsSync(originalPath)) {
          try {
            fs.unlinkSync(originalPath);
            console.log(`[API-COMPILE-PDF] Deleted original image cache: ${originalFilename}`);
          } catch (err) {
            console.error(`[API-COMPILE-PDF] Disk cleanup error:`, err);
          }
        }
      }

      res.json({ success: true, url: finalPdfUrl });
    } catch (err: any) {
      console.error("[API-COMPILE-PDF] Compilation error:", err);
      res.status(500).json({ error: "Erro ao compilar PDF: " + err.message });
    }
  });

  // Self-healing custom asset proxy serving uploads
  app.get("/api/uploads/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(UPLOADS_DIR, filename);
      
      // 1. Resolve immediately if cache hit on disk
      if (fs.existsSync(filePath)) {
        if (filename.endsWith(".pdf")) {
          res.setHeader("Content-Type", "application/pdf");
        } else {
          const ext = filename.split(".").pop() || "png";
          res.setHeader("Content-Type", `image/${ext === "jpg" ? "jpeg" : ext}`);
        }
        return res.sendFile(filePath);
      }
      
      // 2. Resolve via Cloud Storage download if disk cache miss
      if (bucket) {
        console.log(`[ASSET-PROXY] Cache miss for ${filename}. Re-fetching from Cloud Storage...`);
        try {
          if (filename.startsWith("pdf_finalizada_")) {
            const requestId = filename.replace("pdf_finalizada_", "").replace(".pdf", "");
            const fileRef = bucket.file(`evidencias/finalizadas/${requestId}.pdf`);
            const [exists] = await fileRef.exists();
            if (exists) {
              const [buffer] = await fileRef.download();
              fs.writeFileSync(filePath, buffer);
              res.setHeader("Content-Type", "application/pdf");
              return res.send(buffer);
            }
          } else {
            // Scan bucket for matching image
            const [files] = await bucket.getFiles({ prefix: "evidencias/pendentes/" });
            const matchingFile = files.find((file: any) => file.name.endsWith(filename));
            if (matchingFile) {
              const [buffer] = await matchingFile.download();
              fs.writeFileSync(filePath, buffer);
              const ext = filename.split(".").pop() || "png";
              res.setHeader("Content-Type", `image/${ext === "jpg" ? "jpeg" : ext}`);
              return res.send(buffer);
            }
          }
        } catch (storageErr: any) {
          console.error(`[ASSET-PROXY] Cloud Storage fetch failed:`, storageErr.message);
        }
      }
      
      res.status(404).json({ error: "Comprovante ou imagem SSTR não encontrado." });
    } catch (err: any) {
      console.error("[ASSET-PROXY] Retrieval error:", err);
      res.status(500).json({ error: "Falha de processamento: " + err.message });
    }
  });

  app.use("/api/uploads", express.static(UPLOADS_DIR));

  // Endpoint to handle instant Cloud-connected uploads
  app.post("/api/upload", async (req, res) => {
    try {
      const { image, requestId } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Nenhum arquivo de imagem recebido." });
      }

      let base64Data = "";
      let extension = "png";

      if (image.startsWith("data:image/jpeg;base64,")) {
        base64Data = image.replace(/^data:image\/jpeg;base64,/, "");
        extension = "jpg";
      } else if (image.startsWith("data:image/png;base64,")) {
        base64Data = image.replace(/^data:image\/png;base64,/, "");
        extension = "png";
      } else if (image.startsWith("data:image/webp;base64,")) {
        base64Data = image.replace(/^data:image\/webp;base64,/, "");
        extension = "webp";
      } else if (image.startsWith("data:image/")) {
        const matches = image.match(/^data:image\/([A-Za-z+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          extension = matches[1];
          base64Data = matches[2];
        } else {
          base64Data = image;
        }
      } else {
        base64Data = image;
      }

      const buffer = Buffer.from(base64Data, "base64");
      const filename = `evidencia_${Date.now()}_${Math.floor(Math.random() * 100000)}.${extension}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      fs.writeFileSync(filePath, buffer);
      
      // Upload to Firebase Cloud Storage under request prefix
      if (bucket) {
        try {
          const destination = requestId 
            ? `evidencias/pendentes/${requestId}/${filename}`
            : `evidencias/pendentes/geral/${filename}`;
            
          await bucket.upload(filePath, {
            destination,
            metadata: {
              contentType: `image/${extension === "jpg" ? "jpeg" : extension}`
            }
          });
          console.log(`[STORAGE-UPLOAD] Uploaded evidence file to Cloud Storage: ${destination}`);
        } catch (err: any) {
          console.warn(`[STORAGE-UPLOAD] Cloud Storage upload warning:`, err.message);
        }
      }
      
      const fileUrl = `/api/uploads/${filename}`;
      res.json({ success: true, url: fileUrl });
    } catch (err: any) {
      console.error("[UPLOAD-ENDPOINT] Server failure:", err);
      res.status(500).json({ error: "Falha ao persistir imagem: " + err.message });
    }
  });

  // API Route for Gemini Chatbot Support Assistant
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { message, context } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Sua mensagem está vazia." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "Chave de API do Gemini (GEMINI_API_KEY) não configurada no servidor. Por favor registre em suas Configurações." 
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Você é o SSTR-ASSISTANT, um assistente inteligente especializado nas operações de trocas e reposições do Portal Pau Brasil Guarabira.
Você prestará suporte a gestores, representantes comerciais e motoristas sobre a base de dados de reposições e as regras operacionais da empresa.

Aqui está o contexto real consolidado do banco de dados de lançamentos atual:
${JSON.stringify(context || {})}

DIRETRIZES IMPORTANTES PARA RESPONDER PERGUNTAS DO BANCO DE DADOS:
1. CLIENTE COM MAIOR SOLICITAÇÃO DE TROCAS:
   - Se o usuário perguntar qual é o cliente com mais trocas, consulte 'stats.topClient'.
   - Responda apresentando claramente o Nome do Cliente, o código NB (codigoCliente), a quantidade de solicitações (count) e o valor total em reais (totalValue).

2. LIMITE / META PARA ESTOURAR:
   - Se o usuário perguntar sobre a meta, o limite ou quanto falta para estourar, use 'stats.metaLimit' (R$ 15.000,00 por padrão), 'stats.totalValue' (consumido) e 'stats.amountToMeta' (quanto falta).
   - Apresente esses números formatados em Reais (R$). Se a meta já tiver estourado ('stats.metaExceeded' for verdadeiro), avise-os com um alerta amigável e profissional. Caso contrário, diga exatamente quanto falta em reais para alcançar/estourar a meta de R$ 15.000,00.

3. BUSCA POR CÓDIGO DO CLIENTE (NB):
   - Se o usuário perguntar sobre um cliente específico informando o código NB (por exemplo, "NB: 769", "769" ou "cliente 769"), procure por essa chave no objeto 'stats.pendingByClient' (removendo espaços se necessário).
   - Se encontrar solicitações pendentes no 'pendingByClient', liste-as detalhadamente para o usuário, contendo: Data, Nota Fiscal (NF), SKU/Produto, Descrição, Quantidade e Valor Total.
   - Caso não existam solicitações pendentes para aquele NB específico ou o NB não conste no mapeamento de pendentes, informe de forma clara que não há nenhuma solicitação pendente no momento para esse cliente.

Importante: Os volumes de reposição podem ser medidos em quantidades físicas e em Hectolitros (HL) se disponível.
Sempre que pertinente, apresente e valorize as duas medições para enriquecer suas respostas!

Diga ao usuário que você está respondendo com base nas informações carregadas no momento de forma humana, precisa e profissional em Português do Brasil.`
              }
            ]
          },
          {
            role: "user",
            parts: [
              {
                text: message
              }
            ]
          }
        ]
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("[GEMINI-ASSISTANT] Server-side error:", err);
      res.status(500).json({ 
        error: `Erro ao processar com assistente inteligente: ${err?.message || "Serviço temporariamente indisponível"}` 
      });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "SSTR Pau Brasil" });
  });

  // Vite development integration or Production static files serving
  if (process.env.NODE_ENV !== "production") {
    console.log("[SERVER] Booting in DEVELOPMENT mode with active Vite Middleware.");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[SERVER] Booting in PRODUCTION mode with compiled static assets.");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] SSTR full-stack core operational on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("[SERVER-CRITICAL] Startup sequence interrupted:", err);
  process.exit(1);
});
